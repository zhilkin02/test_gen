
'use client';

import type React from 'react';
import { useRef, useState, type ChangeEvent } from 'react';
import { UploadCloud, LoaderCircle, FileText, Image as ImageIcon, FileType, FileQuestion, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { UploadedFileInfo } from '@/types';
import mammoth from 'mammoth';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FileUploadFormProps {
  onBatchProcessed: (infos: UploadedFileInfo[]) => void; // Changed from onFileSuccessfullyProcessed
  onBatchProcessingStart: () => void;
  onFileProcessingFailure: (fileName: string, error: string) => void; // Remains for individual file errors during local processing
  onBatchProcessingComplete: () => void;
}

export default function FileUploadForm({ 
  onBatchProcessed, 
  onBatchProcessingStart,
  onFileProcessingFailure,
  onBatchProcessingComplete
}: FileUploadFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false); // Renamed from isProcessingBatch for clarity
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const filesFromInput = event.target.files;
    if (filesFromInput && filesFromInput.length > 0) {
      const newFilesArray = Array.from(filesFromInput);
      const validFiles: File[] = [];
      const oversizedFiles: string[] = [];

      newFilesArray.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          oversizedFiles.push(file.name);
        } else {
          validFiles.push(file);
        }
      });

      if (oversizedFiles.length > 0) {
        toast({
          title: "Некоторые файлы слишком большие",
          description: `Файлы: ${oversizedFiles.join(', ')} превышают лимит в 10MB и не будут добавлены.`,
          variant: "warning",
          duration: 5000,
        });
      }
      
      setSelectedFiles(validFiles);
      if (validFiles.length > 0) {
         // Parent will be signaled by onBatchProcessingStart when submit is clicked
      }

    } else {
      setSelectedFiles([]);
    }
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Файлы не выбраны",
        description: "Пожалуйста, выберите файлы для обработки.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    onBatchProcessingStart(); 

    const processedInfos: UploadedFileInfo[] = [];
    // No need to track individual successful files for a callback here,
    // failures are handled by onFileProcessingFailure.

    for (const file of selectedFiles) {
      const fileName = file.name;
      const fileType = file.type || 'application/octet-stream';
      const fileSize = file.size;
      let currentFileProcessedInfo: UploadedFileInfo = { fileName, fileType, fileSize };

      const readFileAsDataURL = (fileToRead: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Не удалось прочитать файл как Data URI."));
          reader.readAsDataURL(fileToRead);
        });
      };

      try {
        if (fileType === 'text/plain' || fileName.toLowerCase().endsWith('.txt') || fileName.toLowerCase().endsWith('.md')) {
          const textContent = await file.text();
          currentFileProcessedInfo = { ...currentFileProcessedInfo, textContent };
        } else if (fileName.toLowerCase().endsWith('.docx') || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });
            currentFileProcessedInfo = { ...currentFileProcessedInfo, textContent: rawText };
          } catch (extractError) {
            console.error(`Error extracting text from .docx file ${fileName}:`, extractError);
            const errorMsg = "Не удалось извлечь текст из файла .docx. Возможно, файл поврежден или имеет неподдерживаемый формат.";
            currentFileProcessedInfo = { ...currentFileProcessedInfo, error: errorMsg };
          }
        } else if (fileType.startsWith('image/')) {
          const dataUri = await readFileAsDataURL(file);
          currentFileProcessedInfo = { ...currentFileProcessedInfo, dataUri };
        } else if (fileName.toLowerCase().endsWith('.pdf') || fileType === 'application/pdf') {
          const dataUri = await readFileAsDataURL(file);
          currentFileProcessedInfo = { ...currentFileProcessedInfo, dataUri };
        } else if (fileName.toLowerCase().endsWith('.doc') || fileType === 'application/msword') {
          const errorMsg = "Файлы .doc (старый формат Word) не могут быть проанализированы. Пожалуйста, используйте .docx или сконвертируйте файл.";
          currentFileProcessedInfo = { ...currentFileProcessedInfo, error: errorMsg };
        } else {
          const errorMsg = `Неподдерживаемый тип файла для локальной обработки: ${fileType || fileName}. Поддерживаются .txt, .md, .docx, PDF, изображения.`;
          currentFileProcessedInfo = { ...currentFileProcessedInfo, error: errorMsg };
        }

        if (currentFileProcessedInfo.error) {
          onFileProcessingFailure(fileName, currentFileProcessedInfo.error);
          toast({ title: `Ошибка обработки: ${fileName}`, description: currentFileProcessedInfo.error, variant: currentFileProcessedInfo.error.includes(".doc ") ? "warning" : "destructive" });
        }
        // Add to batch regardless of local error, page.tsx will filter for AI processing
        processedInfos.push(currentFileProcessedInfo);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Произошла неизвестная ошибка при обработке файла.";
        const finalErrorMsg = `Ошибка обработки файла ${fileName}: ${errorMessage}`;
        onFileProcessingFailure(fileName, finalErrorMsg);
        processedInfos.push({ fileName, fileType, fileSize, error: finalErrorMsg }); // Ensure errored file is in the batch info
        toast({ title: `Критическая ошибка обработки: ${fileName}`, description: errorMessage, variant: "destructive" });
      }
    } // end of loop

    if (processedInfos.length > 0) {
      onBatchProcessed(processedInfos); // Send all results, even those with local errors
    }

    setIsProcessing(false);
    onBatchProcessingComplete();
    
    // Optional: Clear selection after processing
    // setSelectedFiles([]); 
    // if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getFileIcon = (file: File) => {
    const lcFileName = file.name.toLowerCase();
    const fileType = file.type;

    if (fileType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />;
    if (lcFileName.endsWith('.pdf')) return <FileQuestion className="h-5 w-5 text-red-500 shrink-0" />;
    if (lcFileName.endsWith('.doc') || lcFileName.endsWith('.docx')) return <FileType className="h-5 w-5 text-blue-500 shrink-0" />;
    if (lcFileName.endsWith('.txt') || lcFileName.endsWith('.md')) return <FileText className="h-5 w-5 text-green-500 shrink-0" />;
    return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  };

  return (
    <Card className="w-full shadow-lg rounded-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Загрузка и анализ лекций</CardTitle>
        <CardDescription>Загрузите один или несколько файлов (.txt, .md, .docx, .pdf, изображение) для AI-анализа и генерации тестовых вопросов.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="file-upload" className="text-base">Выберите файлы (до 10MB каждый)</Label>
          <Input
            id="file-upload"
            type="file"
            ref={fileInputRef}
            accept=".txt,.md,image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf,.doc,application/msword"
            onChange={handleFileChange}
            multiple 
            className="text-base file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>

        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center">
              <List className="h-4 w-4 mr-2"/> Выбранные файлы: ({selectedFiles.length})
            </h3>
            <ScrollArea className="h-32 max-h-[20vh] rounded-md border p-2 bg-secondary/30">
              <ul className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <li key={index} className="p-2 border-b border-border/50 last:border-b-0 rounded-md bg-card/50 flex items-center gap-3 text-sm">
                    {getFileIcon(file)}
                    <span className="text-foreground truncate flex-grow" title={file.name}>{file.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">({(file.size / 1024).toFixed(2)} KB)</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={selectedFiles.length === 0 || isProcessing} className="w-full text-lg py-6">
          {isProcessing ? (
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-5 w-5" />
          )}
          {isProcessing ? `Обрабатываем (${selectedFiles.length})...` : `Обработать и анализировать ${selectedFiles.length > 1 ? `(${selectedFiles.length} файла(ов))` : '(1 файл)'}`}
        </Button>
      </CardContent>
    </Card>
  );
}
