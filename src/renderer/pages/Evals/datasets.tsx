/* eslint-disable no-void, no-alert */
import { type MouseEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { IconDatabase, IconPlus, IconTrash } from '@tabler/icons-react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { Textarea } from '@/renderer/components/ui/textarea';
import { Badge } from '@/renderer/components/ui/badge';
import { DatasetRecord, shortDate } from './types';

export default function DatasetsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electron.evals.listDatasets({
        page: 0,
        perPage: 100,
      });
      setDatasets(result.datasets || []);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createDataset = async () => {
    if (!name.trim()) return;
    try {
      const dataset = await window.electron.evals.createDataset({
        name,
        description: description || undefined,
      });
      setOpen(false);
      setName('');
      setDescription('');
      toast.success(t('evals.dataset_created'));
      navigate(`/evals/datasets/${dataset.id}`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const removeDataset = async (event: MouseEvent, dataset: DatasetRecord) => {
    event.stopPropagation();
    if (!window.confirm(t('evals.confirm_delete_dataset'))) return;
    try {
      await window.electron.evals.deleteDataset(dataset.id);
      await load();
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('evals.workspace')}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {t('evals.datasets')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('evals.datasets_description')}
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <IconPlus size={16} />
            {t('evals.new_dataset')}
          </Button>
        </div>

        {!loading && datasets.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors hover:bg-muted/40"
          >
            <span className="rounded-full bg-primary/10 p-3 text-primary">
              <IconDatabase size={24} />
            </span>
            <strong className="mt-4">{t('evals.empty_datasets')}</strong>
            <span className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t('evals.empty_datasets_description')}
            </span>
          </button>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {datasets.map((dataset) => (
              <Card
                key={dataset.id}
                className="group cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => navigate(`/evals/datasets/${dataset.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{dataset.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2 min-h-10">
                        {dataset.description || t('evals.no_description')}
                      </CardDescription>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('common.delete')}
                      className="opacity-0 group-hover:opacity-100"
                      onClick={(event) => void removeDataset(event, dataset)}
                    >
                      <IconTrash size={15} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="secondary">v{dataset.version}</Badge>
                  <span>{shortDate(dataset.updatedAt)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('evals.new_dataset')}</DialogTitle>
            <DialogDescription>
              {t('evals.new_dataset_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="dataset-name">{t('common.name')}</Label>
              <Input
                id="dataset-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dataset-description">
                {t('common.description')}
              </Label>
              <Textarea
                id="dataset-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => void createDataset()}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
