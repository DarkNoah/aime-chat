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
import { FieldGroup } from '@/renderer/components/ui/field';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/renderer/components/ui/badge';
import {
  IconEdit,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Textarea } from '@/renderer/components/ui/textarea';

interface SecretItem {
  id: string;
  key: string;
  value: string;
  description?: string;
  global: boolean;
}

interface SecretFormData {
  key: string;
  value: string;
  description: string;
  global: boolean;
}

const emptyForm: SecretFormData = {
  key: '',
  value: '',
  description: '',
  global: true,
};

export default function Secrets() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  setTitle(t('settings.secrets'));

  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<SecretFormData>(emptyForm);
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());

  const loadSecrets = useCallback(async () => {
    const list = await window.electron.secrets.getList();
    setSecrets(list);
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const toggleValueVisibility = (id: string) => {
    setVisibleValues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (secret: SecretItem) => {
    setEditingId(secret.id);
    setForm({
      key: secret.key,
      value: secret.value,
      description: secret.description || '',
      global: secret.global,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.key.trim() || !form.value.trim()) return;

    if (editingId) {
      await window.electron.secrets.update(editingId, {
        key: form.key.trim(),
        value: form.value.trim(),
        description: form.description.trim() || undefined,
        global: form.global,
      });
    } else {
      await window.electron.secrets.create({
        key: form.key.trim(),
        value: form.value.trim(),
        description: form.description.trim() || undefined,
        global: form.global,
      });
    }
    setDialogOpen(false);
    await loadSecrets();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await window.electron.secrets.delete(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
    await loadSecrets();
  };

  const maskValue = (value: string) => {
    if (value.length <= 4) return '••••••••';
    return value.slice(0, 2) + '••••••' + value.slice(-2);
  };

  return (
    <FieldGroup className="p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">
            {t('settings.secrets')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.secrets_description')}
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <IconPlus size={16} />
          {t('common.add')}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('settings.secrets_key')}</TableHead>
            <TableHead>{t('settings.secrets_value')}</TableHead>
            <TableHead>
              {t('settings.secrets_description_col')}
            </TableHead>
            <TableHead>{t('settings.secrets_global')}</TableHead>
            <TableHead className="text-right">
              {t('common.actions', "Actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground py-8"
              >
                {t('settings.secrets_empty')}
              </TableCell>
            </TableRow>
          )}
          {secrets.map((secret) => (
            <TableRow key={secret.id}>
              <TableCell className="font-mono font-medium">
                {secret.key}
              </TableCell>
              <TableCell className="font-mono">
                <div className="flex items-center gap-1">
                  <span className="max-w-[200px] truncate">
                    {visibleValues.has(secret.id)
                      ? secret.value
                      : maskValue(secret.value)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => toggleValueVisibility(secret.id)}
                  >
                    {visibleValues.has(secret.id) ? (
                      <IconEyeOff size={14} />
                    ) : (
                      <IconEye size={14} />
                    )}
                  </Button>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground max-w-[200px] truncate">
                {secret.description || '-'}
              </TableCell>
              <TableCell>
                {secret.global && (
                  <Badge variant="secondary">{t('settings.secrets_global')}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEditDialog(secret)}
                  >
                    <IconEdit size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => openDeleteDialog(secret.id)}
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
              {editingId
                ? t('settings.secrets_edit')
                : t('settings.secrets_add')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>{t('settings.secrets_key')}</Label>
              <Input
                placeholder="e.g. API_KEY"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('settings.secrets_value')}</Label>
              <Input
                placeholder="Value"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>
                {t('settings.secrets_description_col')}
              </Label>
              <Textarea
                placeholder={t('settings.secrets_description_placeholder')}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.global}
                onCheckedChange={(checked) =>
                  setForm({ ...form, global: checked })
                }
              />
              <Label>{t('settings.secrets_global')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.key.trim() || !form.value.trim()}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.secrets_delete_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.secrets_delete_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FieldGroup>
  );
}
