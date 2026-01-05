import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldContent, FieldLabel } from '../ui/field';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/renderer/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  BriefcaseBusiness,
  CheckCircle2Icon,
  CodeIcon,
  Folder,
  FolderCode,
  Globe,
  Lightbulb,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';
import { cn } from '@/renderer/lib/utils';
import { useGlobal } from '@/renderer/hooks/use-global';
import { changeLanguage, getCurrentLanguage } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Streamdown } from '../ai-elements/streamdown';
import { IconLanguage } from '@tabler/icons-react';
import { LanguageCode, LanguageCodes, Languages } from '@/types/languages';
import { isString } from '@/utils/is';

export interface TranslProps {
  children?: string;
  className?: string;
  useMarkdown?: boolean;
}

export function Transl(props: TranslProps) {
  const { children, className, useMarkdown = false } = props;
  const [content, setContent] = useState<string | any | undefined>(children);
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] =
    useState<LanguageCode>(getCurrentLanguage());
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentLang(getCurrentLanguage());
  }, []);

  const handleTranslation = async (lang?: LanguageCode) => {
    let targetLang = lang;
    if (!lang) {
      targetLang = getCurrentLanguage() as LanguageCode;
    }
    try {
      const translation = await window.electron.app.translation(
        children,
        targetLang,
        true,
      );
      setContent(translation);
    } catch {}
  };

  const getTranslation = useCallback(
    async (lang?: LanguageCode) => {
      let targetLang = lang;
      if (!lang) {
        targetLang = getCurrentLanguage() as LanguageCode;
      }
      if (isString(children) && children) {
        const translation = await window.electron.app.translation(
          children,
          targetLang,
        );
        return translation;
      }
      return children ?? '';
    },
    [children],
  );

  useEffect(() => {
    getTranslation(currentLang).then((t) => {
      setContent(t);
    });
    // getTranslation(currentLang);
  }, [children, currentLang]);

  return (
    <div className={cn('relative ', className)}>
      {useMarkdown && <Streamdown>{content}</Streamdown>}
      {!useMarkdown && (
        <pre className={cn('text-xs break-all text-wrap')}>{content}</pre>
      )}
      {mounted && (
        <DropdownMenu onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn(
                'absolute right-0 top-0 backdrop-blur hover:opacity-100 opacity-100 ',
                open ? 'opacity-100' : 'opacity-20',
              )}
            >
              <IconLanguage className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LanguageCodes.map((lang) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => handleTranslation(lang)}
                className={cn(currentLang === lang && 'bg-accent font-medium')}
              >
                {Languages[lang]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
