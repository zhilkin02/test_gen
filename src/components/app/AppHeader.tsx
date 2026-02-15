import { GraduationCap } from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';

export default function AppHeader() {
  return (
    <header className="py-6 px-4 md:px-8 border-b">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-primary">ТестГен</h1>
        </div>
        <ThemeSwitcher />
      </div>
    </header>
  );
}
