/* eslint-disable no-await-in-loop */
import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/renderer/components/ui/dialog';
import Form from '@rjsf/shadcn';
import type { RJSFSchema, Widget, WidgetProps } from '@rjsf/utils';
import { IconLoader, IconSearch, IconSettings } from '@tabler/icons-react';
import z, { ZodSchema } from 'zod';
import validator from '@rjsf/validator-ajv8';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { useCallback, useState } from 'react';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/renderer/lib/utils';
import { UploadIcon, FileIcon, XIcon } from 'lucide-react';
import { FileInfo } from '@/types/common';
import fileSize from 'filesize';
import { Input } from '@/renderer/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import { SkillInfo } from '@/types/skill';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';

// function formatFileSize(bytes: number): string {
//   if (bytes === 0) return '0 B';
//   const k = 1024;
//   const sizes = ['B', 'KB', 'MB', 'GB'];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
// }

export function SkillImportDialog({
  open,
  onOpenChange,
  importPath,
  onImportSkillsSuccess,
  // onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importPath?: string;
  onImportSkillsSuccess?: (skills: SkillInfo[]) => void;
  // onSubmit?: (e: any) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileInfo[]>([]);
  const [gitUrl, setGitUrl] = useState<string>('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedGitUrl, setSelectedGitUrl] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const reset = () => {
    setSkills([]);
    setSelectedSkills([]);
    setGitUrl('');
    setDroppedFiles([]);
  };
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (x) =>
        x.name.toLocaleLowerCase().endsWith('.skill') ||
        x.name.toLocaleLowerCase().endsWith('.zip'),
    );

    if (files.length === 0 && Array.from(e.dataTransfer.files).length > 0) {
      toast.error(t('common.please_drop_skill_file'));
      return;
    }
    for (const file of files) {
      const path = window.electron.app.getPathForFile(file);
      const fileInfo = await window.electron.app.getFileInfo(path);
      setDroppedFiles((prev) => [...prev, fileInfo]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setDroppedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    // onSubmit?.(e);
    try {
      setImporting(true);
      if (droppedFiles && droppedFiles.length > 0) {
        const result = await window.electron.tools.importSkills({
          files: droppedFiles.map((x) => x.path),
          path: importPath,
        });
      } else if (selectedSkills.length > 0) {
        const result = await window.electron.tools.importSkills({
          repo_or_url: gitUrl,
          selectedSkills,
          path: importPath,
        });
      }

      toast.success(t('common.import_success'));
      onImportSkillsSuccess?.(skills);
      onOpenChange(false);
      reset();
      // navigate(`/tools/${result.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handlePreviewGitSkill = async () => {
    // onSubmit?.(e);
    if (loading) return;
    setLoading(true);
    setSkills([]);
    setSelectedSkills([]);
    const result = await window.electron.tools.previewGitSkill({
      gitUrl,
    });
    if (result.success) {
      setSelectedGitUrl(result.repoUrl);
      setSkills(result.skills);
      setSelectedSkills(result.skills.map((x) => x.path));
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  const handleOpenChange = (_open: boolean) => {
    reset();
    onOpenChange(_open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('tools.import_skill')}</DialogTitle>
        </DialogHeader>
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative flex flex-col items-center justify-center',
            'min-h-[120px] rounded-lg border-2 border-dashed',
            'transition-all duration-200 ease-in-out cursor-pointer',
            isDragOver
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50 bg-muted/30',
          )}
        >
          <div className="flex flex-col items-center gap-2 p-4 text-center pointer-events-none">
            <UploadIcon
              className={cn(
                'w-8 h-8 transition-colors',
                isDragOver ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <p
              className={cn(
                'text-sm transition-colors',
                isDragOver ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isDragOver
                ? t('common.drop_files_here')
                : t('common.drag_files_here')}
            </p>
          </div>
        </div>
        <small className="text-muted-foreground text-sm">
          {t('tools.import_skill_tips')}
        </small>
        <InputGroup>
          <InputGroupInput
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handlePreviewGitSkill();
              }
            }}
            placeholder={t('common.enter_git_url')}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              variant="ghost"
              className="rounded-full"
              onClick={() => handlePreviewGitSkill()}
              disabled={loading}
            >
              {loading && <IconLoader className="w-4 h-4 animate-spin" />}
              {!loading && <IconSearch className="w-4 h-4" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {/* 已拖入的文件列表 */}
        {droppedFiles.length > 0 && (
          <div className="mt-2 space-y-2">
            {droppedFiles.map((file, index) => (
              <div
                key={`${file.path}-${index}`}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group"
              >
                <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1" title={file.path}>
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fileSize.filesize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {skills.length > 0 && (
          <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
            {skills.map((skill) => (
              <Item
                key={skill.path}
                variant="muted"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  setSelectedSkills((prev) => {
                    if (prev.includes(skill.path)) {
                      return prev.filter((x) => x !== skill.path);
                    } else {
                      return [...prev, skill.path];
                    }
                  });
                }}
              >
                <ItemContent className="flex flex-row items-center gap-2">
                  <Checkbox checked={selectedSkills.includes(skill.path)} />
                  <div className="flex flex-col">
                    <ItemTitle> {skill.name}</ItemTitle>
                    <ItemDescription> {skill.description}</ItemDescription>
                  </div>
                </ItemContent>
              </Item>
            ))}
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={
            (selectedSkills.length === 0 && droppedFiles.length === 0) ||
            importing
          }
        >
          {!importing && t('common.import')}
          {importing && (
            <div className="flex flex-row gap-2 items-center">
              {t('common.importing')}{' '}
              <IconLoader className="w-4 h-4 animate-spin" />
            </div>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
