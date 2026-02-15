
export interface UploadedFileInfo {
  fileName: string;
  fileType: string;
  fileSize: number;
  textContent?: string; // For extracted text from .txt, .md, .docx
  dataUri?: string; // For images or PDF to display/pass to AI
  error?: string; // If there was an error processing the file locally
}

export interface LectureAnalysisResult {
  keyConcepts: string[];
  themes: string[];
  summary: string;
}

// --- Question Types ---
export type QuestionType = 'fill-in-the-blank' | 'single-choice' | 'multiple-choice' | 'matching';

export interface BaseQuestion {
  questionText: string;
}

export interface FillInTheBlankQuestion extends BaseQuestion {
  type: 'fill-in-the-blank';
  correctAnswer: string;
}

export interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single-choice';
  options: string[];
  correctAnswer: string; 
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  options: string[];
  correctAnswers: string[]; 
}

export interface MatchingPair {
  prompt: string;
  option: string;
}

export interface MatchingQuestion extends BaseQuestion {
  type: 'matching';
  prompts: string[];
  options: string[];
  correctMatches: MatchingPair[]; 
}


export type GeneratedQuestion = FillInTheBlankQuestion | SingleChoiceQuestion | MultipleChoiceQuestion | MatchingQuestion;


// --- Editable Question Item (Discriminated Union) ---
interface EditableBaseQuestion {
  id: string;
  selected: boolean;
  editedQuestionText: string;
}

export interface EditableFillInTheBlankQuestion extends EditableBaseQuestion {
  type: 'fill-in-the-blank';
  originalQuestion: FillInTheBlankQuestion; 
  editedCorrectAnswer: string;
}

export interface EditableOption {
  id: string; 
  text: string;
}

export interface EditableSingleChoiceQuestion extends EditableBaseQuestion {
  type: 'single-choice';
  originalQuestion: SingleChoiceQuestion;
  editedOptions: EditableOption[];
  editedCorrectAnswer: string; 
}

export interface EditableMultipleChoiceQuestion extends EditableBaseQuestion {
  type: 'multiple-choice';
  originalQuestion: MultipleChoiceQuestion;
  editedOptions: EditableOption[];
  editedCorrectAnswers: string[];
}

export interface EditableMatchingQuestion extends EditableBaseQuestion {
    type: 'matching';
    originalQuestion: MatchingQuestion;
    editedPrompts: EditableOption[];
    editedOptions: EditableOption[];
    editedCorrectMatches: Record<string, string>; // Maps prompt text to option text
}

export type EditableQuestionItem = 
  | EditableFillInTheBlankQuestion 
  | EditableSingleChoiceQuestion 
  | EditableMultipleChoiceQuestion
  | EditableMatchingQuestion;

// Defines the structure for a single content item to be analyzed by AI
export interface LectureContentItem {
  fileName: string;
  contentType: 'text' | 'image' | 'pdf';
  rawTextContent?: string;
  contentDataUri?: string;
}

// --- Gemini model choice (for UI and API) ---
export type GeminiModelId = 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.5-pro';

/** Порядок fallback: при ошибке пробуем следующую модель */
export const GEMINI_FALLBACK_ORDER: GeminiModelId[] = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];

export const GEMINI_MODEL_LABELS: Record<GeminiModelId, string> = {
  'gemini-2.5-flash-lite': 'Flash-Lite (по умолчанию)',
  'gemini-2.5-flash': 'Flash',
  'gemini-2.5-pro': 'Pro',
};
