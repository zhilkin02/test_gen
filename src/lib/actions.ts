'use server';

import {
  analyzeLectureContent,
  type AnalyzeLectureContentInput,
  type AnalyzeLectureContentResult,
} from '@/ai/flows/analyze-lecture-content';
import {
  generateTestQuestions,
  type GenerateTestQuestionsInput,
  type GenerateTestQuestionsResult,
} from '@/ai/flows/generate-test-questions';

export async function handleAnalyzeContent(
  input: AnalyzeLectureContentInput
): Promise<AnalyzeLectureContentResult | { error: string }> {
  try {
    return await analyzeLectureContent(input);
  } catch (e) {
    console.error("Error analyzing content:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during analysis.";
    return { error: `Не удалось проанализировать контент: ${errorMessage}` };
  }
}

export async function handleGenerateQuestions(
  input: GenerateTestQuestionsInput
): Promise<GenerateTestQuestionsResult | { error: string }> {
  try {
    return await generateTestQuestions(input);
  } catch (e) {
    console.error("Error generating questions:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during question generation.";
    return { error: `Не удалось сгенерировать вопросы: ${errorMessage}` };
  }
}
