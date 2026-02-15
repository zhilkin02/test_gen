
'use client';

import type { UploadedFileInfo } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { AlertCircle, FileText, ImageIcon, FileQuestion, FileType as FileTypeIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface FileInfoDisplayProps {
  filesInfo: UploadedFileInfo[] | null;
}

export default function FileInfoDisplay({ filesInfo }: FileInfoDisplayProps) {
  if (!filesInfo || filesInfo.length === 0) {
    return (
        <Card className="w-full shadow-lg rounded-xl">
            <CardHeader>
                <CardTitle className="text-2xl font-semibold">Информация о файлах</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Файлы не загружены или не обработаны.</p>
            </CardContent>
        </Card>
    );
  }

  const getFileIcon = (fileType: string, fileName: string) => {
    const lcFileName = fileName.toLowerCase();
    if (fileType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-primary shrink-0" />;
    if (fileType === 'application/pdf' || lcFileName.endsWith('.pdf')) return <FileQuestion className="h-5 w-5 text-red-600 shrink-0" />;
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lcFileName.endsWith('.docx')) return <FileTypeIcon className="h-5 w-5 text-blue-600 shrink-0" />;
    if (fileType === 'text/plain' || lcFileName.endsWith('.txt') || lcFileName.endsWith('.md')) return <FileText className="h-5 w-5 text-green-600 shrink-0" />;
    return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  };

  const successfullyProcessedCount = filesInfo.filter(f => !f.error).length;
  const erroredCount = filesInfo.filter(f => f.error).length;


  return (
    <Card className="w-full shadow-lg rounded-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Информация о загруженных файлах ({filesInfo.length})</CardTitle>
        <CardDescription>
            {successfullyProcessedCount > 0 && `Успешно для анализа: ${successfullyProcessedCount}. `}
            {erroredCount > 0 && `С локальными ошибками: ${erroredCount}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-96 max-h-[60vh] pr-3">
          <Accordion type="multiple" className="w-full space-y-2">
            {filesInfo.map((fileInfo, index) => (
              <AccordionItem value={`item-${index}`} key={index} className="border bg-card/60 rounded-lg px-0">
                <AccordionTrigger className="px-4 py-3 text-base hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    {getFileIcon(fileInfo.fileType, fileInfo.fileName)}
                    <span className="font-medium truncate flex-grow text-left">{fileInfo.fileName}</span>
                    {fileInfo.error && <AlertCircle className="h-5 w-5 text-destructive shrink-0" />}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Тип: {fileInfo.fileType} | Размер: {(fileInfo.fileSize / 1024).toFixed(2)} KB
                  </p>
                  {fileInfo.error && (
                    <div className="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Ошибка локальной обработки:</p>
                        <p className="text-xs">{fileInfo.error}</p>
                      </div>
                    </div>
                  )}
                  {/* Show text content preview only for the first successfully processed text file for brevity */}
                  {index === filesInfo.findIndex(f => f.textContent && !f.error) && fileInfo.textContent && !fileInfo.error && (
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-muted-foreground">Извлеченный текст (фрагмент):</h4>
                      <ScrollArea className="h-24 max-h-[15vh] rounded-md border p-2 bg-muted/20">
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">
                          {fileInfo.textContent.substring(0, 500)}{fileInfo.textContent.length > 500 ? '...' : ''}
                        </p>
                      </ScrollArea>
                    </div>
                  )}
                  {/* Show image preview only for the first successfully processed image file */}
                  {index === filesInfo.findIndex(f => f.fileType.startsWith('image/') && f.dataUri && !f.error) && fileInfo.fileType.startsWith('image/') && fileInfo.dataUri && !fileInfo.error && (
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-muted-foreground">Предпросмотр изображения:</h4>
                      <div className="relative w-full aspect-video max-h-[20vh] border rounded-md overflow-hidden bg-muted/20">
                        <Image 
                          src={fileInfo.dataUri} 
                          alt={fileInfo.fileName} 
                          layout="fill"
                          objectFit="contain" 
                          data-ai-hint="uploaded image preview"
                        />
                      </div>
                    </div>
                  )}
                   {!fileInfo.textContent && !(fileInfo.fileType.startsWith('image/')) && !fileInfo.error && 
                    (fileInfo.fileType === 'application/pdf' || fileInfo.fileType.includes('wordprocessingml')) && (
                    <p className="text-xs text-muted-foreground">Содержимое этого файла будет передано AI для анализа. Предпросмотр здесь не отображается.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
