'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';

import { Switch } from '@/renderer/components/ui/switch';
import { useGlobal } from '../hooks/use-global';
import {
  IconFile,
  IconFileCode,
  IconFileText,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypeTxt,
  IconFileWord,
  IconMarkdown,
} from '@tabler/icons-react';

export type FileIconProps = {
  filePath?: string;
  className?: string;
};

export function FileIcon(props: FileIconProps) {
  const { filePath, className } = props;
  const ext = filePath?.split('.').pop();
  switch (ext) {
    case 'txt':
      return <IconFileTypeTxt className={className} />;
    case 'md':
      return <IconMarkdown className={className} />;
    case 'json':
      return <IconFileText className={className} />;
    case 'doc':
      return <IconFileTypeDoc className={className} />;
    case 'docx':
      return <IconFileTypeDocx className={className} />;
    case 'html':
      return <IconFileCode className={className}></IconFileCode>;
    default:
      return <IconFile className={className} />;
  }
}
