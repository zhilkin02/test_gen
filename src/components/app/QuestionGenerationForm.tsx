
'use client';

import type React from 'react';
import { useState } from 'react';
import { Wand2, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { QuestionType } from '@/types';

export interface QuestionGenerationFormProps {
  analysisSummary: string;
  onGenerationStartParams: (numQuestions: number, difficulty: 'easy' | 'medium' | 'hard', questionType: QuestionType) => void;
  isLoading?: boolean;
}

export default function QuestionGenerationForm({
  analysisSummary,
  onGenerationStartParams,
  isLoading = false,
}: QuestionGenerationFormProps) {
  const [numQuestions, setNumQuestions] = useState('5');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<QuestionType>('single-choice'); // Default type
  const { toast } = useToast();

  const handleSubmit = () => {
    const num = parseInt(numQuestions, 10);
    if (isNaN(num) || num <= 0 || num > 20) {
      toast({
        title: "Неверное количество",
        description: "Количество вопросов должно быть от 1 до 20.",
        variant: "destructive",
      });
      return;
    }
    if (!questionType) {
      toast({
        title: "Тип вопроса не выбран",
        description: "Пожалуйста, выберите тип вопросов для генерации.",
        variant: "destructive",
      });
      return;
    }
    onGenerationStartParams(num, difficulty, questionType);
  };

  return (
    <Card className="w-full shadow-lg rounded-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Генерация вопросов</CardTitle>
        <CardDescription>Укажите параметры для генерации тестовых вопросов на основе анализа.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="num-questions" className="text-base">Количество вопросов (1-20)</Label>
          <Input
            id="num-questions"
            type="number"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            min="1"
            max="20"
            className="text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="difficulty" className="text-base">Уровень сложности</Label>
          <Select value={difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setDifficulty(value)}>
            <SelectTrigger id="difficulty" className="w-full text-base">
              <SelectValue placeholder="Выберите сложность" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Легкий</SelectItem>
              <SelectItem value="medium">Средний</SelectItem>
              <SelectItem value="hard">Сложный</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="question-type" className="text-base">Тип вопроса</Label>
          <Select value={questionType} onValueChange={(value: QuestionType) => setQuestionType(value)}>
            <SelectTrigger id="question-type" className="w-full text-base">
              <SelectValue placeholder="Выберите тип вопроса" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fill-in-the-blank">Заполнить пропуск</SelectItem>
              <SelectItem value="single-choice">Одиночный выбор</SelectItem>
              <SelectItem value="multiple-choice">Множественный выбор</SelectItem>
              <SelectItem value="matching">Сопоставление</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button 
          onClick={handleSubmit} 
          disabled={isLoading || !analysisSummary} 
          className="w-full text-lg py-6"
        >
          {isLoading ? (
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-5 w-5" />
          )}
          {isLoading ? 'Генерируем...' : 'Сгенерировать вопросы'}
        </Button>
      </CardContent>
    </Card>
  );
}
