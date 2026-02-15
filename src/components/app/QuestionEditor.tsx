
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Save, Trash2, PlusCircle, MinusCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { 
  EditableQuestionItem, 
  EditableFillInTheBlankQuestion,
  EditableSingleChoiceQuestion,
  EditableMultipleChoiceQuestion,
  EditableMatchingQuestion,
  EditableOption,
  GeneratedQuestion,
  MatchingPair
} from '@/types';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';

interface QuestionEditorProps {
  questions: EditableQuestionItem[];
  isLoading?: boolean;
  onQuestionUpdate: (updatedQuestion: EditableQuestionItem) => void;
  onQuestionDelete: (questionId: string) => void;
}

export default function QuestionEditor({ 
  questions: initialQuestions, 
  isLoading = false,
  onQuestionUpdate,
  onQuestionDelete
}: QuestionEditorProps) {
  const [questions, setQuestions] = useState<EditableQuestionItem[]>(initialQuestions);
  const { toast } = useToast();

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  const handleQuestionTextChange = (id: string, value: string) => {
    const question = questions.find(q => q.id === id);
    if (question) {
      onQuestionUpdate({ ...question, editedQuestionText: value });
    }
  };

  const handleSelectionChange = (id: string, selected: boolean) => {
     const question = questions.find(q => q.id === id);
    if (question) {
      onQuestionUpdate({ ...question, selected });
    }
  };
  
  const handleFillInTheBlankAnswerChange = (id: string, answer: string) => {
    const question = questions.find(q => q.id === id) as EditableFillInTheBlankQuestion;
    if (question) onQuestionUpdate({ ...question, editedCorrectAnswer: answer });
  };

  const handleOptionTextChange = (questionId: string, optionId: string, newText: string, isPrompt: boolean = false) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    if (question.type === 'single-choice' || question.type === 'multiple-choice') {
      const oldOptionText = (question.editedOptions.find(o => o.id === optionId)!).text;
      const updatedOptions = question.editedOptions.map(opt => opt.id === optionId ? { ...opt, text: newText } : opt );
      
      let updatedCorrectAnswer = (question as EditableSingleChoiceQuestion).editedCorrectAnswer;
      if (question.type === 'single-choice' && oldOptionText === updatedCorrectAnswer) {
          updatedCorrectAnswer = newText;
      }
      
      let updatedCorrectAnswers = (question as EditableMultipleChoiceQuestion).editedCorrectAnswers;
      if (question.type === 'multiple-choice' && updatedCorrectAnswers.includes(oldOptionText)) {
         updatedCorrectAnswers = updatedCorrectAnswers.map(ca => ca === oldOptionText ? newText : ca);
      }

      onQuestionUpdate({ 
        ...question, 
        editedOptions: updatedOptions, 
        ...(question.type === 'single-choice' && { editedCorrectAnswer: updatedCorrectAnswer }),
        ...(question.type === 'multiple-choice' && { editedCorrectAnswers: updatedCorrectAnswers })
      });

    } else if (question.type === 'matching') {
        const targetArray = isPrompt ? question.editedPrompts : question.editedOptions;
        const oldText = (targetArray.find(item => item.id === optionId)!).text;
        const updatedArray = targetArray.map(item => item.id === optionId ? { ...item, text: newText } : item);

        if (isPrompt) {
            const updatedMatches = { ...question.editedCorrectMatches };
            if (oldText in updatedMatches) {
                const matchValue = updatedMatches[oldText];
                delete updatedMatches[oldText];
                updatedMatches[newText] = matchValue;
            }
             onQuestionUpdate({ ...question, editedPrompts: updatedArray, editedCorrectMatches: updatedMatches });
        } else {
            const updatedMatches = { ...question.editedCorrectMatches };
            for (const key in updatedMatches) {
                if (updatedMatches[key] === oldText) {
                    updatedMatches[key] = newText;
                }
            }
             onQuestionUpdate({ ...question, editedOptions: updatedArray, editedCorrectMatches: updatedMatches });
        }
    }
  };
  
  const handleSingleChoiceCorrectAnswerChange = (questionId: string, correctAnswerText: string) => {
    const question = questions.find(q => q.id === questionId) as EditableSingleChoiceQuestion;
    if (question) onQuestionUpdate({ ...question, editedCorrectAnswer: correctAnswerText });
  };

  const handleMultipleChoiceCorrectAnswerChange = (questionId: string, optionText: string, isChecked: boolean) => {
    const question = questions.find(q => q.id === questionId) as EditableMultipleChoiceQuestion;
    if (question) {
      const editedCorrectAnswers = isChecked ? [...question.editedCorrectAnswers, optionText] : question.editedCorrectAnswers.filter(ans => ans !== optionText);
      onQuestionUpdate({ ...question, editedCorrectAnswers });
    }
  };
  
  const handleMatchingCorrectMatchChange = (questionId: string, promptId: string, selectedOptionText: string) => {
    const question = questions.find(q => q.id === questionId) as EditableMatchingQuestion;
    if (question) {
        const promptText = question.editedPrompts.find(p => p.id === promptId)?.text;
        if (promptText) {
            onQuestionUpdate({ ...question, editedCorrectMatches: { ...question.editedCorrectMatches, [promptText]: selectedOptionText } });
        }
    }
  };

  const addOptionOrPrompt = (questionId: string, isPrompt: boolean = false) => {
    const question = questions.find(q => q.id === questionId);
     if (!question) return;

    const limit = (question.type === 'matching') ? 8 : 5;
    const currentCount = (question.type === 'matching') ? (isPrompt ? question.editedPrompts.length : question.editedOptions.length) : question.editedOptions.length;

    if (currentCount >= limit) {
        toast({ title: `Максимум ${isPrompt ? 'элементов' : 'вариантов'}`, description: `Можно добавить не более ${limit} ${isPrompt ? 'элементов' : 'вариантов'}.`, variant: "default"});
        return;
    }

    if (question.type === 'single-choice' || question.type === 'multiple-choice' || question.type === 'matching') {
        const newText = isPrompt ? `Новый элемент ${currentCount + 1}` : `Новый вариант ${currentCount + 1}`;
        const newItem: EditableOption = { id: uuidv4(), text: newText };
        
        if (question.type === 'matching') {
            if (isPrompt) onQuestionUpdate({ ...question, editedPrompts: [...question.editedPrompts, newItem] });
            else onQuestionUpdate({ ...question, editedOptions: [...question.editedOptions, newItem] });
        } else {
             onQuestionUpdate({ ...question, editedOptions: [...question.editedOptions, newItem] });
        }
    }
  };

  const removeOptionOrPrompt = (questionId: string, itemId: string, isPrompt: boolean = false) => {
     const question = questions.find(q => q.id === questionId);
     if (!question) return;

     const minItems = 2;
     if (question.type === 'single-choice' || question.type === 'multiple-choice') {
        if (question.editedOptions.length > minItems) {
            const optionToRemove = question.editedOptions.find(opt => opt.id === itemId);
            const updatedOptions = question.editedOptions.filter(opt => opt.id !== itemId);
            let updatedQuestion: EditableSingleChoiceQuestion | EditableMultipleChoiceQuestion = { ...question, editedOptions: updatedOptions };

            if (updatedQuestion.type === 'single-choice' && updatedQuestion.editedCorrectAnswer === optionToRemove?.text) {
              updatedQuestion.editedCorrectAnswer = updatedOptions.length > 0 ? updatedOptions[0].text : "";
            } else if (updatedQuestion.type === 'multiple-choice' && updatedQuestion.editedCorrectAnswers.includes(optionToRemove?.text || '')) {
               updatedQuestion.editedCorrectAnswers = updatedQuestion.editedCorrectAnswers.filter(ans => ans !== optionToRemove?.text);
            }
            onQuestionUpdate(updatedQuestion);
        } else {
             toast({ title: "Минимум вариантов", description: `Должно быть не менее ${minItems} вариантов ответа.`, variant: "default"});
        }
    } else if (question.type === 'matching') {
        const targetArray = isPrompt ? question.editedPrompts : question.editedOptions;
        if (targetArray.length <= minItems) {
            toast({ title: "Минимум элементов", description: `Должно быть не менее ${minItems} ${isPrompt ? 'элементов' : 'вариантов'}.`, variant: "default"});
            return;
        }
        const itemToRemove = targetArray.find(item => item.id === itemId);
        const updatedArray = targetArray.filter(item => item.id !== itemId);
        const updatedMatches = { ...question.editedCorrectMatches };
        
        if (isPrompt) {
            if (itemToRemove && itemToRemove.text in updatedMatches) delete updatedMatches[itemToRemove.text];
            onQuestionUpdate({ ...question, editedPrompts: updatedArray, editedCorrectMatches: updatedMatches });
        } else {
            if (itemToRemove) {
                 for (const key in updatedMatches) {
                    if (updatedMatches[key] === itemToRemove.text) {
                        delete updatedMatches[key];
                    }
                }
            }
            onQuestionUpdate({ ...question, editedOptions: updatedArray, editedCorrectMatches: updatedMatches });
        }
    }
  };

  const getSelectedQuestions = (): GeneratedQuestion[] => {
    return questions
      .filter(q => q.selected)
      .map(q => {
        const { type, editedQuestionText } = q;
        switch (q.type) {
          case 'fill-in-the-blank':
            return { type, questionText: editedQuestionText, correctAnswer: q.editedCorrectAnswer };
          case 'single-choice':
            return { type, questionText: editedQuestionText, options: q.editedOptions.map(opt => opt.text), correctAnswer: q.editedCorrectAnswer };
          case 'multiple-choice':
            return { type, questionText: editedQuestionText, options: q.editedOptions.map(opt => opt.text), correctAnswers: q.editedCorrectAnswers };
          case 'matching':
            const correctMatchesArray: MatchingPair[] = Object.entries(q.editedCorrectMatches).map(([prompt, option]) => ({ prompt, option }));
            return { 
                type, 
                questionText: editedQuestionText, 
                prompts: q.editedPrompts.map(p => p.text), 
                options: q.editedOptions.map(o => o.text), 
                correctMatches: correctMatchesArray 
            };
          default:
            return null;
        }
      }).filter((q): q is GeneratedQuestion => q !== null);
  };

  const handleSaveToJson = () => {
    const selectedQuestionsToExport = getSelectedQuestions();

    if (selectedQuestionsToExport.length === 0) {
      toast({ title: "Нет выбранных вопросов", description: "Пожалуйста, выберите вопросы для сохранения.", variant: "destructive" });
      return;
    }

    const dataStr = JSON.stringify({ questions: selectedQuestionsToExport }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'test_questions.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    linkElement.remove();

    toast({ title: "Вопросы сохранены в JSON", description: "Выбранные вопросы были сохранены в файл JSON." });
  };
  
  const handleSaveToGift = () => {
    const selectedQuestionsToExport = getSelectedQuestions();

    if (selectedQuestionsToExport.length === 0) {
      toast({ title: "Нет выбранных вопросов", description: "Пожалуйста, выберите вопросы для сохранения.", variant: "destructive" });
      return;
    }
    
    const escapeGiftChars = (text: string) => text.replace(/([~=#{}])/g, '\$1');

    const giftContent = selectedQuestionsToExport.map((q, index) => {
      const title = `::Вопрос ${index + 1}::`;
      const questionText = escapeGiftChars(q.questionText);

      switch (q.type) {
        case 'fill-in-the-blank':
          // Assuming the blank is '___' and should be replaced by the answer.
          const filledText = questionText.replace('___', `{=${escapeGiftChars(q.correctAnswer)}}`);
          return `${title}${filledText}`;
        
        case 'single-choice':
          const singleChoiceAnswers = q.options.map(opt => 
            opt === q.correctAnswer 
              ? `=${escapeGiftChars(opt)}` 
              : `~${escapeGiftChars(opt)}`
          ).join(' ');
          return `${title}${questionText} {${singleChoiceAnswers}}`;

        case 'multiple-choice':
           const correctAnswers = q.correctAnswers;
           const correctWeight = correctAnswers.length > 0 ? 100 / correctAnswers.length : 0;
           const multipleChoiceAnswers = q.options.map(opt => {
                if (correctAnswers.includes(opt)) {
                    return `~%${correctWeight}%${escapeGiftChars(opt)}`;
                } else {
                    return `~%0%${escapeGiftChars(opt)}`; // Or a negative value
                }
           }).join(' ');
           return `${title}${questionText} {${multipleChoiceAnswers}}`;

        case 'matching':
          const matchingPairs = q.correctMatches.map(pair => 
            `=${escapeGiftChars(pair.prompt)} -> ${escapeGiftChars(pair.option)}`
          ).join(' ');
          return `${title}${questionText} {${matchingPairs}}`;

        default:
          return `// Unsupported question type for GIFT format: ${(q as any).type}`;
      }
    }).join('\n\n');

    const dataStr = giftContent;
    const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'test_questions.txt';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    linkElement.remove();

    toast({ title: "Вопросы сохранены в GIFT", description: "Выбранные вопросы были сохранены в файл .txt." });
  };


  if (isLoading) {
    return (
      <Card className="w-full shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Предпросмотр и редактирование</CardTitle>
          <CardDescription>Загрузка сгенерированных вопросов...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 border rounded-lg space-y-3 animate-pulse">
              <div className="h-6 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
              <div className="h-8 bg-muted rounded mt-2"></div>
              <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
              <div className="h-12 bg-muted rounded mt-2"></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }
  
  if (!questions || questions.length === 0) {
     return (
      <Card className="w-full shadow-lg rounded-xl">
        <CardHeader><CardTitle className="text-2xl font-semibold">Предпросмотр и редактирование</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-center py-8">Вопросы еще не сгенерированы.</p></CardContent>
      </Card>
    );
  }

  const renderQuestionContent = (q: EditableQuestionItem) => {
    switch (q.type) {
      case 'fill-in-the-blank':
        return (
          <div className="space-y-2">
            <Label htmlFor={`answer-${q.id}`} className="text-sm text-muted-foreground">Правильный ответ (заполняет "___"):</Label>
            <Input id={`answer-${q.id}`} value={q.editedCorrectAnswer} onChange={(e) => handleFillInTheBlankAnswerChange(q.id, e.target.value)} className="text-base p-2" placeholder="Ответ для пропуска" />
          </div>
        );
      case 'single-choice':
      case 'multiple-choice':
        return (
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">Варианты ответа:</Label>
             {q.editedOptions.map((opt, index) => (
                <div key={opt.id} className="flex items-center space-x-2">
                 {q.type === 'single-choice' ? (
                    <RadioGroup value={q.editedCorrectAnswer} onValueChange={(value) => handleSingleChoiceCorrectAnswerChange(q.id, value)} className="flex items-center"><RadioGroupItem value={opt.text} id={`${q.id}-option-${opt.id}`} /></RadioGroup>
                  ) : (
                    <Checkbox id={`${q.id}-option-${opt.id}`} checked={q.editedCorrectAnswers.includes(opt.text)} onCheckedChange={(checked) => handleMultipleChoiceCorrectAnswerChange(q.id, opt.text, !!checked)} />
                  )}
                  <Input value={opt.text} onChange={(e) => handleOptionTextChange(q.id, opt.id, e.target.value)} className="flex-grow text-base p-2" placeholder={`Вариант ${index + 1}`} />
                  <Button variant="ghost" size="icon" onClick={() => removeOptionOrPrompt(q.id, opt.id)} className="text-destructive hover:bg-destructive/10" disabled={q.editedOptions.length <= 2}><MinusCircle className="h-4 w-4" /></Button>
                </div>
              ))}
             <Button variant="outline" size="sm" onClick={() => addOptionOrPrompt(q.id)} disabled={q.editedOptions.length >= 5}><PlusCircle className="mr-2 h-4 w-4" /> Добавить вариант</Button>
          </div>
        );
      case 'matching':
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <div>
                        <Label className="text-sm text-muted-foreground">Элементы</Label>
                        <div className="space-y-2 mt-2">
                            {q.editedPrompts.map((prompt, index) => (
                                <div key={prompt.id} className="flex items-center space-x-2">
                                    <Input value={prompt.text} onChange={(e) => handleOptionTextChange(q.id, prompt.id, e.target.value, true)} className="flex-grow text-base p-2" placeholder={`Элемент ${index + 1}`} />
                                    <Button variant="ghost" size="icon" onClick={() => removeOptionOrPrompt(q.id, prompt.id, true)} className="text-destructive hover:bg-destructive/10" disabled={q.editedPrompts.length <= 2}><MinusCircle className="h-4 w-4" /></Button>
                                </div>
                            ))}
                             <Button variant="outline" size="sm" onClick={() => addOptionOrPrompt(q.id, true)} disabled={q.editedPrompts.length >= 8}><PlusCircle className="mr-2 h-4 w-4" /> Добавить элемент</Button>
                        </div>
                    </div>
                    <div>
                        <Label className="text-sm text-muted-foreground">Варианты</Label>
                        <div className="space-y-2 mt-2">
                             {q.editedOptions.map((option, index) => (
                                <div key={option.id} className="flex items-center space-x-2">
                                    <Input value={option.text} onChange={(e) => handleOptionTextChange(q.id, option.id, e.target.value, false)} className="flex-grow text-base p-2" placeholder={`Вариант ${index + 1}`} />
                                    <Button variant="ghost" size="icon" onClick={() => removeOptionOrPrompt(q.id, option.id, false)} className="text-destructive hover:bg-destructive/10" disabled={q.editedOptions.length <= 2}><MinusCircle className="h-4 w-4" /></Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => addOptionOrPrompt(q.id, false)} disabled={q.editedOptions.length >= 8}><PlusCircle className="mr-2 h-4 w-4" /> Добавить вариант</Button>
                        </div>
                    </div>
                </div>
                <div>
                     <Label className="text-sm text-muted-foreground">Правильные сопоставления</Label>
                     <div className="space-y-2 mt-2 border p-3 rounded-md bg-muted/20">
                        {q.editedPrompts.map(prompt => (
                            <div key={prompt.id} className="flex items-center space-x-3">
                                <Label htmlFor={`match-${prompt.id}`} className="flex-1 min-w-[100px] truncate" title={prompt.text}>{prompt.text}</Label>
                                <Select value={q.editedCorrectMatches[prompt.text] || ""} onValueChange={(value) => handleMatchingCorrectMatchChange(q.id, prompt.id, value)} >
                                    <SelectTrigger id={`match-${prompt.id}`} className="flex-2"><SelectValue placeholder="Выберите..." /></SelectTrigger>
                                    <SelectContent>
                                        {q.editedOptions.map(opt => (<SelectItem key={opt.id} value={opt.text}>{opt.text}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                     </div>
                </div>
            </div>
        );
      default:
        return <p>Неизвестный тип вопроса</p>;
    }
  };

  const getQuestionTypeLabel = (type: EditableQuestionItem['type']) => {
    const labels = { 'fill-in-the-blank': 'Заполнить пропуск', 'single-choice': 'Одиночный выбор', 'multiple-choice': 'Множественный выбор', 'matching': 'Сопоставление' };
    return labels[type] || 'Неизвестный';
  }

  return (
    <Card className="w-full shadow-lg rounded-xl">
      <CardHeader className="flex flex-row items-start sm:items-center justify-between">
        <div className="flex-grow">
          <CardTitle className="text-2xl font-semibold">Предпросмотр и редактирование</CardTitle>
          <CardDescription>Отметьте, отредактируйте и сохраните нужные вопросы.</CardDescription>
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="default" className="ml-auto text-base shrink-0">
                    <Save className="mr-2 h-4 w-4" />
                    Сохранить выбранные
                    <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSaveToJson}>
                    Сохранить в JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSaveToGift}>
                    Сохранить в GIFT (.txt)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[550px] pr-0 sm:pr-4">
          <div className="space-y-6">
            {questions.map((q) => (
              <Card key={q.id} className="bg-card/50 p-1 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-start gap-3 p-4">
                   <Checkbox id={`select-${q.id}`} checked={q.selected} onCheckedChange={(checked) => handleSelectionChange(q.id, !!checked)} className="mt-1" aria-label={`Выбрать вопрос ${q.id}`} />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`question-${q.id}`} className="text-base font-medium sr-only">Текст вопроса:</Label>
                    <Textarea id={`question-${q.id}`} value={q.editedQuestionText} onChange={(e) => handleQuestionTextChange(q.id, e.target.value)} className="text-base flex-grow font-medium p-2 border-0 focus-visible:ring-1 focus-visible:ring-primary min-h-[60px]" placeholder="Текст вопроса..." />
                    <p className="text-xs text-muted-foreground">Тип: {getQuestionTypeLabel(q.type)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onQuestionDelete(q.id)} className="text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /><span className="sr-only">Удалить вопрос</span></Button>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1 ml-3 sm:ml-9">{renderQuestionContent(q)}</CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
