import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import type { GeminiModelId } from '@/types';
import { GEMINI_FALLBACK_ORDER } from '@/types';

const MODEL_IDS: GeminiModelId[] = [...GEMINI_FALLBACK_ORDER];

const aiByModel = new Map<GeminiModelId, ReturnType<typeof genkit>>();

for (const modelId of MODEL_IDS) {
  aiByModel.set(modelId, genkit({
    plugins: [googleAI()],
    model: `googleai/${modelId}`,
  }));
}

/** Экземпляр AI по умолчанию (Flash-Lite) */
export const ai = aiByModel.get('gemini-2.5-flash-lite')!;

/** Получить экземпляр Genkit для указанной модели (для fallback по квотам) */
export function getAiForModel(modelId: GeminiModelId) {
  const instance = aiByModel.get(modelId);
  if (!instance) throw new Error(`Unknown model: ${modelId}`);
  return instance;
}
