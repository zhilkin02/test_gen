'use client';

import { useState, useCallback } from 'react';
import AppHeader from '@/components/app/AppHeader';
import FileUploadForm from '@/components/app/FileUploadForm';
import FileInfoDisplay from '@/components/app/FileInfoDisplay';
import AnalysisResults from '@/components/app/AnalysisResults';
import QuestionGenerationForm from '@/components/app/QuestionGenerationForm';
import QuestionEditor from '@/components/app/QuestionEditor';
import type {
  UploadedFileInfo,
  LectureAnalysisResult,
  EditableQuestionItem,
  GeneratedQuestion,
  QuestionType,
  EditableFillInTheBlankQuestion,
  EditableSingleChoiceQuestion,
  EditableMultipleChoiceQuestion,
  EditableMatchingQuestion,
  LectureContentItem,
  GeminiModelId,
} from '@/types';
import { GEMINI_FALLBACK_ORDER, GEMINI_MODEL_LABELS } from '@/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Terminal, LoaderCircle, Info, Files, Cpu } from "lucide-react";
import { handleAnalyzeContent } from '@/lib/actions'; // AnalyzeLectureContentInput is now batch
import { handleGenerateQuestions } from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/hooks/use-toast";


export default function Home() {
  const [processedFilesBatch, setProcessedFilesBatch] = useState<UploadedFileInfo[] | null>(null);
  const [isBatchProcessingClient, setIsBatchProcessingClient] = useState(false); // True if FileUploadForm is doing local processing
  const [localBatchProcessingErrors, setLocalBatchProcessingErrors] = useState<{fileName: string, error: string}[]>([]);

  const [analysisResult, setAnalysisResult] = useState<LectureAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [editableQuestions, setEditableQuestions] = useState<EditableQuestionItem[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [questionGenerationError, setQuestionGenerationError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<GeminiModelId>('gemini-2.5-flash-lite');
  const { toast } = useToast();

  const modelLabelShort = (id: GeminiModelId) => GEMINI_MODEL_LABELS[id].replace(' (по умолчанию)', '');

  const resetUIStateForNewBatch = useCallback(() => {
    setProcessedFilesBatch(null);
    setLocalBatchProcessingErrors([]);
    setAnalysisResult(null);
    setAnalysisError(null);
    setEditableQuestions([]);
    setQuestionGenerationError(null);
  }, []);

  const handleBatchProcessingStart = useCallback(() => {
    setIsBatchProcessingClient(true);
    resetUIStateForNewBatch(); 
  }, [resetUIStateForNewBatch]);
  
  const handleFileProcessingFailureInBatch = useCallback((fileName: string, error: string) => {
    setLocalBatchProcessingErrors(prev => [...prev, {fileName, error}]);
  }, []);

  const handleBatchProcessed = useCallback(async (infos: UploadedFileInfo[]) => {
    setProcessedFilesBatch(infos);
    
    const filesForAnalysis: LectureContentItem[] = [];
    let filesHadLocalErrors = false;

    infos.forEach(info => {
      if (info.error) {
        filesHadLocalErrors = true;
        return; 
      }
      if (info.textContent) {
        filesForAnalysis.push({ fileName: info.fileName, contentType: 'text', rawTextContent: info.textContent });
      } else if (info.dataUri && info.fileType.startsWith('image/')) {
        filesForAnalysis.push({ fileName: info.fileName, contentType: 'image', contentDataUri: info.dataUri });
      } else if (info.dataUri && info.fileType === 'application/pdf') {
         filesForAnalysis.push({ fileName: info.fileName, contentType: 'pdf', contentDataUri: info.dataUri });
      }
    });

    if (filesForAnalysis.length === 0) {
      const errorMsg = "Нет файлов, подходящих для AI-анализа в загруженной пачке.";
      setAnalysisError(errorMsg);
      setIsAnalyzing(false);
      if (!filesHadLocalErrors) {
          toast({ title: "Анализ невозможен", description: errorMsg, variant: "warning" });
      }
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null); 
    setEditableQuestions([]); 
    setQuestionGenerationError(null);
    
    try {
      toast({ title: `Анализ ${filesForAnalysis.length} файла(ов)`, description: "Начало AI-анализа контента..." });
      const result = await handleAnalyzeContent({ contents: filesForAnalysis, preferredModel: selectedModel });
      if ('error' in result) {
        setAnalysisError(result.error);
        setAnalysisResult(null);
        toast({ title: `Ошибка анализа ${filesForAnalysis.length} файла(ов)`, description: result.error, variant: "destructive" });
      } else {
        const { usedModel, fallbackUsed, ...analysisData } = result;
        setAnalysisResult(analysisData);
        setAnalysisError(null);
        if (fallbackUsed) {
          setSelectedModel(usedModel);
          const prevLabel = modelLabelShort(selectedModel);
          const newLabel = modelLabelShort(usedModel);
          toast({
            title: "Анализ завершен",
            description: `Модель «${prevLabel}» не отвечает — использована «${newLabel}». Контент ${filesForAnalysis.length} файла(ов) проанализирован.`,
            variant: "warning",
          });
        } else {
          toast({ title: `Анализ завершен`, description: `Контент ${filesForAnalysis.length} файла(ов) успешно проанализирован.` });
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Неизвестная ошибка при анализе.";
      setAnalysisError(`Ошибка анализа для ${filesForAnalysis.length} файла(ов): ${errorMsg}`);
      setAnalysisResult(null);
      toast({ title: `Критическая ошибка анализа`, description: errorMsg, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }

  }, [toast, selectedModel]);


  const handleBatchProcessingClientComplete = useCallback(() => {
    setIsBatchProcessingClient(false);
  }, []);


  const onQuestionGenerationStartCallback = useCallback(async (numQuestions: number, difficulty: 'easy' | 'medium' | 'hard', questionType: QuestionType) => {
    if (!analysisResult || !analysisResult.summary) {
      toast({ title: "Ошибка", description: "Нет данных анализа для генерации вопросов.", variant: "destructive"});
      return;
    }
    if (!processedFilesBatch || processedFilesBatch.length === 0) {
      toast({ title: "Ошибка", description: "Нет информации о файлах для контекста генерации.", variant: "destructive"});
      return;
    }

    setIsGeneratingQuestions(true);
    setQuestionGenerationError(null);
    setEditableQuestions([]);

    try {
      const firstFileName = processedFilesBatch.find(f => !f.error)?.fileName || "пакета файлов";
      toast({ title: `Генерация вопросов для: ${firstFileName}`, description: "Начало генерации тестовых вопросов..." });
      const result = await handleGenerateQuestions({
        lectureContent: analysisResult.summary,
        numberOfQuestions: numQuestions,
        questionDifficulty: difficulty,
        questionType: questionType,
        preferredModel: selectedModel,
      });

      if ('error' in result) {
        setQuestionGenerationError(result.error);
        setEditableQuestions([]);
        toast({ title: `Ошибка генерации вопросов для: ${firstFileName}`, description: result.error, variant: "destructive"});
      } else {
        const { usedModel, fallbackUsed } = result;
        if (fallbackUsed) {
          setSelectedModel(usedModel);
          const prevLabel = modelLabelShort(selectedModel);
          const newLabel = modelLabelShort(usedModel);
          toast({ title: "Вопросы сгенерированы", description: `Модель «${prevLabel}» не отвечает — использована «${newLabel}».`, variant: "warning" });
        } else {
          toast({ title: `Вопросы сгенерированы для: ${firstFileName}`, description: "Тестовые вопросы успешно созданы." });
        }
        
        const newEditableQuestions = result.questions.map((q: GeneratedQuestion) => {
          const baseEditable = { id: uuidv4(), selected: true, editedQuestionText: q.questionText };
          switch (q.type) {
            case 'fill-in-the-blank':
              return { ...baseEditable, type: q.type, originalQuestion: q, editedCorrectAnswer: q.correctAnswer } as EditableFillInTheBlankQuestion;
            case 'single-choice':
              return { ...baseEditable, type: q.type, originalQuestion: q, editedOptions: q.options.map(opt => ({ id: uuidv4(), text: opt })), editedCorrectAnswer: q.correctAnswer } as EditableSingleChoiceQuestion;
            case 'multiple-choice':
              return { ...baseEditable, type: q.type, originalQuestion: q, editedOptions: q.options.map(opt => ({ id: uuidv4(), text: opt })), editedCorrectAnswers: q.correctAnswers } as EditableMultipleChoiceQuestion;
            case 'matching':
              const correctMatchesRecord: Record<string, string> = q.correctMatches.reduce((acc, match) => {
                acc[match.prompt] = match.option;
                return acc;
              }, {} as Record<string, string>);
              return {
                ...baseEditable,
                type: q.type,
                originalQuestion: q,
                editedPrompts: q.prompts.map(p => ({ id: uuidv4(), text: p })),
                editedOptions: q.options.map(o => ({ id: uuidv4(), text: o })),
                editedCorrectMatches: correctMatchesRecord,
              } as EditableMatchingQuestion;
            default:
              console.error("Unknown question type from AI:", q);
              return null; 
          }
        }).filter((q): q is EditableQuestionItem => q !== null);
        
        setEditableQuestions(newEditableQuestions);
        setQuestionGenerationError(null);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Неизвестная ошибка при генерации вопросов.";
      const firstFileName = processedFilesBatch.find(f => !f.error)?.fileName || "пакета файлов";
      setQuestionGenerationError(`Ошибка генерации для ${firstFileName}: ${errorMsg}`);
      setEditableQuestions([]);
      toast({ title: `Критическая ошибка генерации для ${firstFileName}`, description: errorMsg, variant: "destructive"});
    } finally {
      setIsGeneratingQuestions(false);
    }
  }, [analysisResult, processedFilesBatch, toast, selectedModel]);

  const handleUpdateEditableQuestion = (updatedQuestion: EditableQuestionItem) => {
    setEditableQuestions(prev => prev.map(q => q.id === updatedQuestion.id ? updatedQuestion : q));
  };

  const handleDeleteEditableQuestion = (questionId: string) => {
    setEditableQuestions(prev => prev.filter(q => q.id !== questionId));
     toast({ title: "Вопрос удален" });
  };

  const getNumSuccessfullyProcessedFiles = () => {
    return processedFilesBatch?.filter(f => !f.error).length || 0;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-secondary/30">
      <AppHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-8">
            <Card className="shadow-lg rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2"><Cpu className="h-5 w-5" />Модель Gemini</CardTitle>
                <CardDescription>Выберите модель для анализа и генерации. При недоступности будет использована следующая.</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedModel} onValueChange={(v) => setSelectedModel(v as GeminiModelId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {GEMINI_FALLBACK_ORDER.map((id) => (
                    <div key={id} className="flex items-center space-x-2">
                      <RadioGroupItem value={id} id={`model-${id}`} /><Label htmlFor={`model-${id}`} className="cursor-pointer text-sm font-normal">{GEMINI_MODEL_LABELS[id]}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
            <FileUploadForm
              onBatchProcessingStart={handleBatchProcessingStart}
              onBatchProcessed={handleBatchProcessed}
              onFileProcessingFailure={handleFileProcessingFailureInBatch}
              onBatchProcessingComplete={handleBatchProcessingClientComplete}
            />
            {isBatchProcessingClient && (
               <div className="p-6 border rounded-xl bg-card shadow-lg"><p className="text-center text-primary animate-pulse flex items-center justify-center"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Идет локальная обработка файлов...</p></div>
            )}
            {localBatchProcessingErrors.length > 0 && !isBatchProcessingClient && (
              <Alert variant="destructive" className="shadow-md rounded-xl">
                <Terminal className="h-4 w-4" /><AlertTitle>Ошибки при локальной обработке!</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1">{localBatchProcessingErrors.map((err, index) => (<li key={index}><strong>{err.fileName}:</strong> {err.error}</li>))}</ul>
                   <p className="mt-2">AI-анализ будет выполнен только для успешно обработанных файлов.</p>
                </AlertDescription>
              </Alert>
            )}
            {isAnalyzing && (
              <div className="p-6 border rounded-xl bg-card shadow-lg mt-4"><p className="text-center text-primary animate-pulse flex items-center justify-center"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Идет AI-анализ {processedFilesBatch ? `${getNumSuccessfullyProcessedFiles()} файла(ов)` : ''}... </p></div>
            )}
            {analysisError && !isAnalyzing && ( 
              <Alert variant="destructive" className="shadow-md rounded-xl mt-4"><Terminal className="h-4 w-4" /><AlertTitle>Ошибка AI-анализа!</AlertTitle><AlertDescription>{analysisError}</AlertDescription></Alert>
            )}
            {analysisResult && !isAnalyzing && !analysisError && (
              <>
                <AnalysisResults results={analysisResult} />
                 <QuestionGenerationForm analysisSummary={analysisResult.summary} onGenerationStartParams={onQuestionGenerationStartCallback} isLoading={isGeneratingQuestions} />
              </>
            )}
             {!isBatchProcessingClient && !processedFilesBatch && localBatchProcessingErrors.length === 0 && !analysisResult && !isAnalyzing && !analysisError && (
                 <div className="p-6 border rounded-xl bg-card shadow-lg text-center mt-8"><Info className="h-6 w-6 mx-auto mb-2 text-muted-foreground"/><p className="text-muted-foreground">Загрузите файлы, чтобы начать.</p></div>
            )}
             {!isBatchProcessingClient && processedFilesBatch && processedFilesBatch.length > 0 && getNumSuccessfullyProcessedFiles() === 0 && !isAnalyzing && !analysisResult && (
                <Alert variant="warning" className="shadow-md rounded-xl mt-4"><Terminal className="h-4 w-4"/><AlertTitle>AI-анализ не выполнен</AlertTitle><AlertDescription>Все загруженные файлы имели ошибки или не подходят для анализа.</AlertDescription></Alert>
             )}
          </div>
          
          <div className="md:sticky md:top-8 space-y-8">
            {processedFilesBatch && processedFilesBatch.length > 0 && !isBatchProcessingClient && (<FileInfoDisplay filesInfo={processedFilesBatch} />)}
            {isGeneratingQuestions && (
              <div className="p-6 border rounded-xl bg-card shadow-lg"><p className="text-center text-primary animate-pulse flex items-center justify-center"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Идет генерация вопросов...</p></div>
            )}
            {questionGenerationError && !isGeneratingQuestions && ( 
              <Alert variant="destructive" className="shadow-md rounded-xl"><Terminal className="h-4 w-4" /><AlertTitle>Ошибка генерации вопросов!</AlertTitle><AlertDescription>{questionGenerationError}</AlertDescription></Alert>
            )}
            {(editableQuestions.length > 0 || isGeneratingQuestions) && !questionGenerationError && (
              <QuestionEditor questions={editableQuestions} isLoading={isGeneratingQuestions} onQuestionUpdate={handleUpdateEditableQuestion} onQuestionDelete={handleDeleteEditableQuestion} />
            )}
            {analysisResult && !isAnalyzing && !analysisError && editableQuestions.length === 0 && !isGeneratingQuestions && !questionGenerationError && (
              <div className="p-6 border rounded-xl bg-card shadow-lg text-center"><Files className="h-6 w-6 mx-auto mb-2 text-muted-foreground"/><p className="text-muted-foreground">Сгенерируйте вопросы на основе анализа.</p></div>
            )}
          </div>
        </div>
      </main>
      <footer className="text-center py-4 border-t text-sm text-muted-foreground">
        © {new Date().getFullYear()} ТестГен. Все права защищены.
      </footer>
    </div>
  );
}
