import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/renderer/components/ui/dialog';
import { Badge } from '@/renderer/components/ui/badge';
import { Separator } from '@/renderer/components/ui/separator';
import { IconLoader } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SkillInfo } from '@/types/skill';
import { FolderOpenIcon } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { Streamdown } from '../ai-elements/streamdown';
import { Transl } from '../translations/transl';

interface SkillDetail extends SkillInfo {
  content?: string;
  isActive?: boolean;
  type?: string;
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: SkillInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await window.electron.tools.getTool(id);
      console.log(res);
      setDetail(res);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && skill?.id) {
      loadDetail(skill.id);
    } else {
      setDetail(null);
    }
  }, [open, skill?.id, loadDetail]);

  const handleOpenPath = () => {
    const path = detail?.path || skill?.path;
    if (path) {
      window.electron.app.openPath(path);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-2">
            {skill?.name}
            {/* {detail?.isActive !== undefined && (
              <Badge variant={detail.isActive ? 'default' : 'secondary'}>
                {detail.isActive ? t('common.active') : t('common.close')}
              </Badge>
            )} */}
            {(detail?.path || skill?.path) && (
              <div className="flex items-center gap-2">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground truncate max-w-[360px] cursor-pointer"
                  onClick={handleOpenPath}
                >
                  <FolderOpenIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {detail?.path || skill?.path}
                  </span>
                </Button>
              </div>
            )}
          </DialogTitle>
          {skill?.description && (
            <DialogDescription className="text-xs">
              {skill.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <IconLoader className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && skill?.skillmd && (
          <div className="flex flex-col gap-3 overflow-y-auto">
            {skill?.skillmd && (
              <>
                <Separator />
                <div className="overflow-y-auto max-h-[400px]">
                  <Transl className="text-xs" useMarkdown>
                    {skill?.skillmd}
                  </Transl>
                  {/* <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">

                  </pre> */}
                </div>
              </>
            )}
          </div>
        )}

        {!loading && !detail && skill && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('common.no_data')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
