import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/components/ui/alert-dialog';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/renderer/components/ui/badge';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { Textarea } from '@/renderer/components/ui/textarea';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Project } from '@/types/project';

interface CronItem {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  projectId?: string;
  description?: string;
  agentId?: string;
  isActive: boolean;
  lastRunAt?: string;
}

interface CronFormData {
  name: string;
  prompt: string;
  cron: string;
  description: string;
  agentId: string;
  projectId: string;
  isActive: boolean;
}

type ProjectOption = Pick<Project, 'id' | 'title'>;

const EMPTY_PROJECT_VALUE = '__none__';

const emptyForm: CronFormData = {
  name: '',
  prompt: '',
  cron: '',
  description: '',
  agentId: '',
  projectId: '',
  isActive: true,
};

function CronsPage() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();

  useEffect(() => {
    setTitle(t('crons.title'));
  }, [setTitle, t]);

  const [crons, setCrons] = useState<CronItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<CronFormData>(emptyForm);

  const loadCrons = useCallback(async () => {
    const list = await window.electron.crons.getList();
    setCrons(list);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await window.electron.projects.getList({ page: 0, size: 100 });
      setProjects(data.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadCrons();
    loadProjects();
  }, [loadCrons, loadProjects]);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: CronItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      prompt: item.prompt,
      cron: item.cron,
      description: item.description || '',
      agentId: item.agentId || '',
      projectId: item.projectId || '',
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim() || !form.cron.trim()) return;

    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      cron: form.cron.trim(),
      description: form.description.trim() || undefined,
      agentId: form.agentId.trim() || undefined,
      projectId: form.projectId || undefined,
      isActive: form.isActive,
    };

    if (editingId) {
      await window.electron.crons.update(editingId, payload);
    } else {
      await window.electron.crons.create(payload);
    }
    setDialogOpen(false);
    await loadCrons();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await window.electron.crons.delete(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
    await loadCrons();
  };

  const handleToggleActive = async (item: CronItem) => {
    await window.electron.crons.update(item.id, { isActive: !item.isActive });
    await loadCrons();
  };

  const projectNameMap = new Map(
    projects.map((p) => [p.id || '', p.title || p.id || '']),
  );

  const formatLastRun = (lastRunAt?: string) => {
    if (!lastRunAt) return t('crons.never');
    return new Date(lastRunAt).toLocaleString();
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">{t('crons.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('crons.description')}
            </p>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <IconPlus size={16} />
            {t('crons.add')}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('crons.name')}</TableHead>
              <TableHead>{t('crons.cron_expression')}</TableHead>
              <TableHead>{t('crons.prompt')}</TableHead>
              <TableHead>{t('common.project')}</TableHead>
              <TableHead>{t('crons.active')}</TableHead>
              <TableHead>{t('crons.last_run_at')}</TableHead>
              <TableHead className="text-right">
                {t('common.actions', 'Actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {crons.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {t('crons.empty')}
                </TableCell>
              </TableRow>
            )}
            {crons.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono">
                    {item.cron}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[250px] truncate text-muted-foreground">
                  {item.prompt}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.projectId
                    ? projectNameMap.get(item.projectId) || item.projectId
                    : '-'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.isActive}
                    onCheckedChange={() => handleToggleActive(item)}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatLastRun(item.lastRunAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(item)}
                    >
                      <IconEdit size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => openDeleteDialog(item.id)}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? t('crons.edit') : t('crons.add')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label>{t('crons.name')}</Label>
                <Input
                  placeholder={t('crons.name')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('crons.cron_expression')}</Label>
                <Input
                  placeholder={t('crons.cron_expression_placeholder')}
                  value={form.cron}
                  className="font-mono"
                  onChange={(e) => setForm({ ...form, cron: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('crons.prompt')}</Label>
                <Textarea
                  placeholder={t('crons.prompt')}
                  value={form.prompt}
                  rows={4}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('crons.description_field')}</Label>
                <Input
                  placeholder={t('crons.description_placeholder')}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('common.project')}</Label>
                <Select
                  value={form.projectId || EMPTY_PROJECT_VALUE}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      projectId: value === EMPTY_PROJECT_VALUE ? '' : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('crons.agent_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_PROJECT_VALUE}>
                      {t('common.no_data')}
                    </SelectItem>
                    {projects.map((project) => (
                      <SelectItem
                        key={project.id}
                        value={project.id || ''}
                      >
                        {project.title || project.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, isActive: checked })
                  }
                />
                <Label>{t('crons.active')}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  !form.name.trim() || !form.prompt.trim() || !form.cron.trim()
                }
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('crons.delete_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('crons.delete_confirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ScrollArea>
  );
}

export default CronsPage;
