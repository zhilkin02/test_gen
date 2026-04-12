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

**1. DIFFICULTY LEVEL (60/40 ratio):**
   • 60% of questions — Analyze, Evaluate, Create levels (Bloom's Taxonomy):
     - Comparison of concepts/approaches/architectures ("What is the advantage of A over B under condition X?")
     - Cause and effect relationships ("Why will the absence of X lead to consequence Y?")
     - "What if..." scenarios ("What will happen if parameter Z is changed?")
     - Analysis of limitations ("In which case is method A not applicable and why?")
   
   • 40% of questions — Remember, Understand levels:
     - Key definitions, terms, basic concepts from the material.
     - ❗ No mechanical memorization of dates, names, abbreviations (unless they are central to understanding the topic).

**2. DISTRACTORS (incorrect options):**
   • All 4 options must be:
     - Semantically close to the correct answer.
     - Plausible for a student with a superficial knowledge of the topic.
     - Reflect typical misconceptions or partial understanding.
   • ❌ Forbidden absurd/obviously incorrect options:
     - Names of famous people unrelated to the topic.
     - Terms from other subject areas.
     - Options that contradict the basic logic of the topic.

**3. STRICTLY BASED ON THE SOURCE MATERIAL:**
   • Use only terms, examples, and concepts explicitly mentioned in the provided text.
   • If a topic is not covered in the material — do not generate questions about it.
   • Do not add external knowledge, even if it is generally accepted.

**4. ANTI-PATTERNS (forbidden formats):**
   ❌ "Who created/proposed/developed [X]?"
   ❌ "In what year did [X] appear?"

**Difficulty Guidelines**:
- **Easy**: Questions should test basic recall of facts directly stated in the lecture content. Distractors (incorrect options) can be clearly wrong.
- **Medium**: Questions should require comprehension and application of the material. Distractors should be plausible, related to the topic, and represent common misunderstandings.
- **Hard**: Questions should demand synthesis, analysis, or evaluation. They might require applying knowledge to new scenarios or making fine distinctions. Distractors must be very subtle and highly relevant, designed to tempt someone who only has a superficial understanding. They should represent common errors or be statements that are almost correct.

**General Instructions**:
- For question types with options (like single-choice, multiple-choice), all incorrect options (distractors) must be plausible and directly related to the subject of the question. Avoid distractors that are obviously incorrect or from completely different topics. 
- **Important**: Ensure that the questions, options, and answers are generated in the same language as the provided 'Lecture Content'.

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
   **Crucial**: This question type MUST have multiple correct answers.
   Provide 3 to 5 unique options.
   The "correctAnswers" array must contain **AT LEAST TWO** strings that are exact matches for items in the "options" array.
   The "type" field must be "multiple-choice".
   A question is only a valid multiple-choice question if it has several correct answers.
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
  console.log('AI THOUGHT: Starting question generation process with input:', JSON.stringify(input, null, 2));

  const preferredModel = input.preferredModel ?? 'gemini-2.5-flash-lite';
  const modelsToTry = getModelsToTry(preferredModel);
  let lastError: unknown;

  console.log(`AI THOUGHT: Model priority list: ${modelsToTry.join(', ')}`);

  for (const modelId of modelsToTry) {
    console.log(`AI THOUGHT: Attempting to generate questions with model: ${modelId}`);
    try {
      const aiInstance = getAiForModel(modelId);
      const prompt = createGenerateQuestionsPrompt(aiInstance, input.questionType);

      console.log(`AI THOUGHT: Calling model '${modelId}' with the generated prompt.`);
      const { output } = await prompt(input);
      
      if (!output) {
        throw new Error("Model returned empty output.");
      }

      console.log(`AI THOUGHT: Successfully generated questions with model: ${modelId}. Output:`, JSON.stringify(output, null, 2));

      const result = {
        ...output,
        usedModel: modelId,
        fallbackUsed: modelId !== preferredModel,
      };

      console.log('AI THOUGHT: Final result object:', JSON.stringify(result, null, 2));
      return result;

    } catch (e) {
      lastError = e;
      const errorMessage = e instanceof Error ? e.message : String(e);

      if (isRetryableError(e)) {
         console.warn(`AI THOUGHT: A retryable error occurred with model '${modelId}'. I will try the next available model. Error:`, errorMessage);
      } else {
         console.error(`AI THOUGHT: A non-retryable error occurred with model '${modelId}'. I cannot proceed with this model. Error:`, e);
         // Stop trying other models if it's not a capacity issue
         throw e;
      }
    }
  }

  console.error('AI THOUGHT: All models failed to generate questions. The last error was:', lastError);
  throw lastError;
}
