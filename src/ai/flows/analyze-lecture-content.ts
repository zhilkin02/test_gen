'use server';
/**
 * @fileOverview Analyzes a batch of lecture content (text, images, or PDF)
 * to identify key concepts, themes, and generate a combined summary.
 * Supports preferred Gemini model with automatic fallback (flash-lite → flash → pro).
 */

import { getAiForModel } from '@/ai/genkit';
import { z } from 'genkit';
import type { LectureContentItem, GeminiModelId } from '@/types';
import { GEMINI_FALLBACK_ORDER } from '@/types';

const LectureContentItemSchema = z.object({
  fileName: z.string().describe("The name of the file."),
  contentType: z.enum(['text', 'image', 'pdf']).describe('The type of the lecture content.'),
  rawTextContent: z.string().optional().describe("Raw text content for text files."),
  contentDataUri: z.string().optional().describe("Lecture content (image, or PDF) as a data URI. It must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
});

const AnalyzeLectureContentInputSchema = z.object({
  contents: z.array(LectureContentItemSchema).min(1).describe('An array of lecture content items to be analyzed together.'),
  preferredModel: z.enum(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']).optional().describe('Preferred Gemini model; on failure the next in fallback order is tried.'),
});
export type AnalyzeLectureContentInput = z.infer<typeof AnalyzeLectureContentInputSchema>;

const AnalyzeLectureContentOutputSchema = z.object({
  keyConcepts: z.array(z.string()).describe('Key concepts identified from all lecture contents.'),
  themes: z.array(z.string()).describe('Main themes identified from all lecture contents.'),
  summary: z.string().describe('A brief combined summary of all lecture contents.'),
});
export type AnalyzeLectureContentOutput = z.infer<typeof AnalyzeLectureContentOutputSchema>;

export type AnalyzeLectureContentResult = AnalyzeLectureContentOutput & {
  usedModel: GeminiModelId;
  fallbackUsed: boolean;
};

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

/** Создаёт промпт анализа для переданного экземпляра ai (для fallback по моделям) */
function createAnalyzePrompt(aiInstance: ReturnType<typeof getAiForModel>) {
  return aiInstance.definePrompt({
    name: 'analyzeLectureBatchContentPrompt',
    input: { schema: AnalyzeLectureContentInputSchema },
    output: { schema: AnalyzeLectureContentOutputSchema },
    prompt: `You are an expert in analyzing multiple lecture materials and synthesizing information.
Analyze the following lecture contents. Identify the key concepts and themes that span across all materials, and provide a single, coherent summary that integrates information from all provided content.
**Important**: Ensure that all outputs (key concepts, themes, and summary) are in the same language as the predominant language of the input content(s). If multiple languages are present, use the language of the first content item.

**ЕСЛИ КОНТЕНТ НА РУССКОМ ЯЗЫКЕ, ВСЕ ПОЛЯ В ВЫХОДНОМ JSON ДОЛЖНЫ БЫТЬ СТРОГО НА РУССКОМ ЯЗЫКЕ. (Ключевые понятия, Темы, Резюме).**
**IF THE CONTENT IS IN RUSSIAN, ALL FIELDS IN THE OUTPUT JSON MUST BE STRICTLY IN RUSSIAN.**

{{#each contents}}
--- START FILE: {{this.fileName}} (Type: {{this.contentType}}) ---
{{#ifEquals this.contentType "text"}}
{{{this.rawTextContent}}}
{{else}}
{{media url=this.contentDataUri}}
{{/ifEquals}}
--- END FILE: {{this.fileName}} ---
{{/each}}

Output the combined key concepts, themes, and summary in the specified JSON format based on ALL the provided content.
Here are some examples of content types for media:
- image
- pdf`,
    templateHelpers: {
      ifEquals: (arg1: unknown, arg2: unknown, options: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string }) => {
        return arg1 == arg2 ? options.fn(this) : options.inverse(this);
      },
    },
  });
}

export async function analyzeLectureContent(input: AnalyzeLectureContentInput): Promise<AnalyzeLectureContentResult> {
  for (const item of input.contents) {
    if (item.contentType !== 'text' && !item.contentDataUri) {
      throw new Error(`Content item '${item.fileName}' of type '${item.contentType}' is missing 'contentDataUri'.`);
    }
    if (item.contentType === 'text' && !item.rawTextContent) {
      throw new Error(`Content item '${item.fileName}' of type 'text' is missing 'rawTextContent'.`);
    }
  }

  const preferredModel = input.preferredModel ?? 'gemini-2.5-flash-lite';
  const modelsToTry = getModelsToTry(preferredModel);
  let lastError: unknown;

  for (const modelId of modelsToTry) {
    try {
      const aiInstance = getAiForModel(modelId);
      const prompt = createAnalyzePrompt(aiInstance);
      const { output } = await prompt(input);
      return {
        ...output!,
        usedModel: modelId,
        fallbackUsed: modelId !== preferredModel,
      };
    } catch (e) {
      lastError = e;
      if (!isRetryableError(e)) throw e;
    }
  }

  throw lastError;
}