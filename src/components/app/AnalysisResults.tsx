'use client';

import type { LectureAnalysisResult } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AnalysisResultsProps {
  results: LectureAnalysisResult;
}

export default function AnalysisResults({ results }: AnalysisResultsProps) {
  return (
    <Card className="w-full shadow-lg rounded-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Результаты анализа</CardTitle>
        <CardDescription>Ключевые понятия, темы и резюме, извлеченные из вашего файла.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-2">Ключевые понятия:</h3>
          {results.keyConcepts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {results.keyConcepts.map((concept, index) => (
                <Badge key={index} variant="secondary" className="text-sm px-3 py-1">{concept}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Ключевые понятия не найдены.</p>
          )}
        </div>
        <Separator />
        <div>
          <h3 className="text-lg font-medium mb-2">Темы:</h3>
          {results.themes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {results.themes.map((theme, index) => (
                <Badge key={index} variant="outline" className="text-sm px-3 py-1">{theme}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Темы не найдены.</p>
          )}
        </div>
        <Separator />
        <div>
          <h3 className="text-lg font-medium mb-2">Резюме:</h3>
          <ScrollArea className="h-32 rounded-md border p-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{results.summary || "Резюме отсутствует."}</p>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
