'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  changeLanguage,
  getCurrentLanguage,
  languages,
  type Language,
} from '@/i18n';
import { Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export interface LanguageToggleProps {
  className?: string;
}

export default function LanguageToggle(props: LanguageToggleProps) {
  const { className } = props;
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] = useState<Language>('en-US');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentLang(getCurrentLanguage());
  }, []);

  const handleLanguageChange = async (language: Language) => {
    await changeLanguage(language);
    setCurrentLang(language);
    await window.electron.app.setLanguage(language);
    // 刷新页面以确保所有翻译都更新
    // 如果不想刷新，可以移除这行
    // window.location.reload();
  };

  if (!mounted) {
    return null;
  }

  return (
    <Select
      value={currentLang}
      onValueChange={(value) => handleLanguageChange(value as Language)}
    >
      <SelectTrigger size="sm" className={cn('gap-1', className)}>
        <div className="flex flex-row items-center gap-2">
          <Globe className="h-4 w-4" />
          <SelectValue placeholder={t(`language.${currentLang}`)} />
        </div>
      </SelectTrigger>
      <SelectContent align="end">
        {languages.map((lang) => (
          <SelectItem
            key={lang}
            value={lang}
            className={currentLang === lang ? 'font-semibold' : ''}
          >
            {t(`language.${lang}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
