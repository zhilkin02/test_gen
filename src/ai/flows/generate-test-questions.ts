'use server';

/**
 * @fileOverview Generates test questions based on analyzed lecture content.
 * Supports preferred Gemini model with automatic fallback (flash-lite → flash → pro).
 */

import { getAiForModel } from '@/ai/genkit';
import { z } from 'genkit';
import type { QuestionType, GeminiModelId } from '@/types';
import { GEMINI_FALLBACK_ORDER } from '@/types';

const QuestionTypeEnumSchema = z.enum(['fill-in-the-blank', 'single-choice', 'multiple-choice', 'matching']);

const GenerateTestQuestionsInputSchema = z.object({
  lectureContent: z.string().describe('The content of the lecture to generate test questions from.'),
  numberOfQuestions: z.number().default(5).describe('The number of test questions to generate.'),
  questionDifficulty: z.enum(['easy', 'medium', 'hard']).default('medium').describe('The difficulty level of the test questions.'),
  questionType: QuestionTypeEnumSchema.describe('The desired type of questions to generate.'),
  preferredModel: z.enum(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']).optional().describe('Preferred Gemini model; on failure the next in fallback order is tried.'),
});
export type GenerateTestQuestionsInput = z.infer<typeof GenerateTestQuestionsInputSchema>;

const BaseQuestionOutputSchema = z.object({
  questionText: z.string().describe("The main text of the question. For fill-in-the-blank, use '___' as a placeholder for the blank space."),
});

const FillInTheBlankOutputSchema = BaseQuestionOutputSchema.extend({
  type: z.enum(['fill-in-the-blank']).describe("The type of the question."),
  correctAnswer: z.string().describe("The word or phrase that correctly fills the blank."),
});

const SingleChoiceOutputSchema = BaseQuestionOutputSchema.extend({
  type: z.enum(['single-choice']).describe("The type of the question."),
  options: z.array(z.string()).min(3).max(5).describe("An array of 3 to 5 unique answer options."),
  correctAnswer: z.string().describe("The single correct answer, which must exactly match one of the provided options."),
});

const MultipleChoiceOutputSchema = BaseQuestionOutputSchema.extend({
  type: z.enum(['multiple-choice']).describe("The type of the question."),
  options: z.array(z.string()).min(3).max(5).describe("An array of 3 to 5 unique answer options."),
  correctAnswers: z.array(z.string()).min(2).describe("An array of AT LEAST TWO correct answers, each must exactly match one of the provided options."),
});

const MatchingPairSchema = z.object({
    prompt: z.string().describe("An item from the 'prompts' array."),
    option: z.string().describe("The matching item from the 'options' array.")
});

const MatchingOutputSchema = BaseQuestionOutputSchema.extend({
  type: z.enum(['matching']).describe("The type of the question."),
  prompts: z.array(z.string()).min(2).max(8).describe("An array of 2 to 8 items to be matched."),
  options: z.array(z.string()).min(2).max(8).describe("An array of 2 to 8 unique options to match from."),
  correctMatches: z.array(MatchingPairSchema).describe("An array of objects, where each object represents a correct pair of a prompt and an option."),
});

const GeneratedQuestionSchema = z.discriminatedUnion("type", [
  FillInTheBlankOutputSchema,
  SingleChoiceOutputSchema,
  MultipleChoiceOutputSchema,
  MatchingOutputSchema,
]);

const GenerateTestQuestionsOutputSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).describe('An array of generated test questions.'),
});
export type GenerateTestQuestionsOutput = z.infer<typeof GenerateTestQuestionsOutputSchema>;

export type GenerateTestQuestionsResult = GenerateTestQuestionsOutput & {
  usedModel: GeminiModelId;
  fallbackUsed: boolean;
};

function getOutputSchemaForType(questionType: QuestionType) {
    let questionSchema;
    switch (questionType) {
        case 'fill-in-the-blank':
            questionSchema = FillInTheBlankOutputSchema;
            break;
        case 'single-choice':
            questionSchema = SingleChoiceOutputSchema;
            break;
        case 'multiple-choice':
            questionSchema = MultipleChoiceOutputSchema;
            break;
        case 'matching':
            questionSchema = MatchingOutputSchema;
            break;
        default:
            throw new Error(`Unsupported question type: ${questionType}`);
    }
    return z.object({
        questions: z.array(questionSchema).describe('An array of generated test questions.'),
    });
}

function isRetryableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('quota') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
}

function getModelsToTry(preferred?: GeminiModelId): GeminiModelId[] {
  if (!preferred) return [...GEMINI_FALLBACK_ORDER];
  const rest = GEMINI_FALLBACK_ORDER.filter((m) => m !== preferred);
  return [preferred, ...rest];
}

function createGenerateQuestionsPrompt(aiInstance: ReturnType<typeof getAiForModel>, questionType: QuestionType) {
  const outputSchema = getOutputSchemaForType(questionType);
  
  return aiInstance.definePrompt({
    name: `generateTestQuestionsPrompt_${questionType}`,
    input: { schema: GenerateTestQuestionsInputSchema },
    output: { schema: outputSchema },
    prompt: `You are an expert educator creating practice test questions for students.
Based on the following lecture content, generate {{numberOfQuestions}} test questions of {{questionDifficulty}} difficulty.
The questions should be of type: {{questionType}}.
**Important**: Ensure that the questions, options, and answers are generated in the same language as the provided 'Lecture Content'.

**ЕСЛИ КОНТЕНТ НА РУССКОМ ЯЗЫКЕ, ВЕСЬ ВЫВОД (вопросы, варианты, ответы) В JSON ДОЛЖЕН БЫТЬ СТРОГО НА РУССКОМ ЯЗЫКЕ.**
**IF THE CONTENT IS IN RUSSIAN, ALL OUTPUT (questions, options, answers) IN THE JSON MUST BE STRICTLY IN RUSSIAN.**

Lecture Content:
{{{lectureContent}}}

Format your response as a JSON object containing a "questions" array. Each object in the array must adhere to the schema for the specified question type.

Here are examples for each question type:

1. If questionType is 'fill-in-the-blank':
   The "questionText" should include "___" to denote the blank.
   The "type" field must be "fill-in-the-blank".
   Example:
   {
     "questions": [
       {
         "type": "fill-in-the-blank",
         "questionText": "The capital of France is ___, known for the Eiffel Tower.",
         "correctAnswer": "Paris"
       }
     ]
   }

2. If questionType is 'single-choice':
   Provide 3 to 5 unique options. "correctAnswer" must be one of these options.
   The "type" field must be "single-choice".
   Example:
   {
     "questions": [
       {
         "type": "single-choice",
         "questionText": "What is the chemical symbol for water?",
         "options": ["O2", "H2O", "CO2", "NaCl"],
         "correctAnswer": "H2O"
       }
     ]
   }

3. If questionType is 'multiple-choice':
   Provide 3 to 5 unique options. 
   "correctAnswers" must be an array containing **AT LEAST TWO** correct options.
   The "type" field must be "multiple-choice".
   Example:
   {
     "questions": [
       {
         "type": "multiple-choice",
         "questionText": "Which of the following are primary colors?",
         "options": ["Red", "Green", "Blue", "Yellow"],
         "correctAnswers": ["Red", "Blue", "Yellow"]
       }
     ]
   }

4. If questionType is 'matching':
   Provide 2 to 8 unique prompts and 2 to 8 unique options.
   The "correctMatches" should be an array of objects, each with a "prompt" and its corresponding "option".
   The "type" field must be "matching".
   Example:
   {
     "questions": [
       {
         "type": "matching",
         "questionText": "Сопоставьте страны с их столицами.",
         "prompts": ["Франция", "Германия", "Испания"],
         "options": ["Берлин", "Мадрид", "Париж"],
         "correctMatches": [
           { "prompt": "Франция", "option": "Париж" },
           { "prompt": "Германия", "option": "Берлин" },
           { "prompt": "Испания", "option": "Мадрид" }
         ]
       }
     ]
   }

  `,
  });
}

export async function generateTestQuestions(input: GenerateTestQuestionsInput): Promise<GenerateTestQuestionsResult> {
  const preferredModel = input.preferredModel ?? 'gemini-2.5-flash-lite';
  const modelsToTry = getModelsToTry(preferredModel);
  let lastError: unknown;

  for (const modelId of modelsToTry) {
    try {
      const aiInstance = getAiForModel(modelId);
      const prompt = createGenerateQuestionsPrompt(aiInstance, input.questionType);
      const { output } = await prompt(input);
      return {
        ...output!,
        usedModel: modelId,
        fallbackUsed: modelId !== preferredModel,
      };
    } catch (e) {
      lastError = e;
      if (!isRetryableError(e)) {
         console.error(`Non-retryable error generating questions of type '${input.questionType}' with model '${modelId}':`, e);
         throw e;
      }
       console.warn(`Retryable error with model ${modelId}. Trying next model. Error:`, e);
    }
  }

  throw lastError;
}
