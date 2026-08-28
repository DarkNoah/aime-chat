/* eslint-disable no-void, no-alert, jsx-a11y/label-has-associated-control */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  IconArrowLeft,
  IconDownload,
  IconEdit,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { Agent } from '@/types/agent';
import { EvalScorerInfo } from '@/types/evals';
import { EvalsChannel } from '@/types/ipc-channel';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import { Checkbox } from '@/renderer/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { Textarea } from '@/renderer/components/ui/textarea';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { useGlobal } from '@/renderer/hooks/use-global';
import {
  DatasetItem,
  DatasetRecord,
  Experiment,
  displayValue,
  shortDate,
} from './types';

const parseEditorValue = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export default function DatasetDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { appInfo } = useGlobal();
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [scorers, setScorers] = useState<EvalScorerInfo[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DatasetItem | null>(null);
  const [itemInput, setItemInput] = useState('');
  const [itemGroundTruth, setItemGroundTruth] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<'csv' | 'jsonl'>('jsonl');
  const [importContent, setImportContent] = useState('');
  const [runOpen, setRunOpen] = useState(false);
  const [runName, setRunName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [modelId, setModelId] = useState('');
  const [selectedScorers, setSelectedScorers] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState(3);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [details, itemPage, experimentPage, scorerList, agentList] =
        await Promise.all([
          window.electron.evals.getDataset(id),
          window.electron.evals.listDatasetItems({
            datasetId: id,
            page: 0,
            perPage: 500,
          }),
          window.electron.evals.listExperiments({
            datasetId: id,
            page: 0,
            perPage: 100,
          }),
          window.electron.evals.listScorers(),
          window.electron.agents.getList(),
        ]);
      setDataset(details);
      setItems(itemPage.items || []);
      setExperiments(experimentPage.experiments || []);
      setScorers(scorerList);
      setAgents(agentList.filter((agent: Agent) => !agent.isHidden));
    } catch (error) {
      toast.error(String(error));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modelId && appInfo?.defaultModel.model) {
      setModelId(appInfo.defaultModel.model);
    }
  }, [appInfo?.defaultModel.model, modelId]);

  useEffect(
    () =>
      window.electron.ipcRenderer.on(
        EvalsChannel.ExperimentProgress,
        (payload: unknown) => {
          const progress = payload as { datasetId?: string };
          if (progress.datasetId === id) void load();
        },
      ),
    [id, load],
  );

  const customScorers = useMemo(
    () => scorers.filter((scorer) => scorer.source === 'custom'),
    [scorers],
  );

  const openNewItem = () => {
    setEditingItem(null);
    setItemInput('');
    setItemGroundTruth('');
    setItemOpen(true);
  };

  const openEditItem = (item: DatasetItem) => {
    setEditingItem(item);
    setItemInput(displayValue(item.input).replace(/^—$/, ''));
    setItemGroundTruth(displayValue(item.groundTruth).replace(/^—$/, ''));
    setItemOpen(true);
  };

  const saveItem = async () => {
    if (!itemInput.trim()) return;
    try {
      const item = {
        input: parseEditorValue(itemInput),
        groundTruth: itemGroundTruth.trim()
          ? parseEditorValue(itemGroundTruth)
          : undefined,
      };
      if (editingItem) {
        await window.electron.evals.updateDatasetItem({
          datasetId: id,
          itemId: editingItem.id,
          item,
        });
      } else {
        await window.electron.evals.addDatasetItems({
          datasetId: id,
          items: [item],
        });
      }
      setItemOpen(false);
      await load();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!window.confirm(t('evals.confirm_delete_item'))) return;
    try {
      await window.electron.evals.deleteDatasetItem({
        datasetId: id,
        itemId,
      });
      await load();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const pickImportFile = async () => {
    const result = await window.electron.app.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Evaluation data', extensions: ['csv', 'jsonl', 'ndjson'] },
      ],
    });
    const filePath = result.filePaths?.[0];
    if (!filePath) return;
    const file = await window.electron.app.readFileContent(filePath);
    if (!file.content) return;
    setImportFormat(filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'jsonl');
    setImportContent(file.content);
    setImportOpen(true);
  };

  const importItems = async () => {
    try {
      const result = await window.electron.evals.importDataset({
        datasetId: id,
        format: importFormat,
        content: importContent,
      });
      setImportOpen(false);
      toast.success(
        t('evals.import_complete', {
          imported: result.imported,
          skipped: result.skipped,
        }),
      );
      await load();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const exportItems = async (format: 'csv' | 'jsonl') => {
    try {
      const exported = await window.electron.evals.exportDataset({
        datasetId: id,
        format,
      });
      const save = await window.electron.app.showSaveDialog({
        defaultPath: exported.filename,
      });
      if (!save.filePath) return;
      await window.electron.evals.saveDatasetExport({
        filePath: save.filePath,
        content: exported.content,
      });
      toast.success(t('evals.export_complete'));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const openRun = () => {
    setRunName(
      `${dataset?.name || 'Evaluation'} · ${new Date().toLocaleString()}`,
    );
    setAgentId(dataset?.targetIds?.[0] || agents[0]?.id || '');
    setSelectedScorers(
      dataset?.scorerIds || customScorers.map((item) => item.id),
    );
    setRunOpen(true);
  };

  const runExperiment = async () => {
    if (!agentId || !modelId || selectedScorers.length === 0) return;
    setRunning(true);
    try {
      const result = await window.electron.evals.startExperiment({
        datasetId: id,
        name: runName,
        agentId,
        modelId,
        scorerIds: selectedScorers,
        maxConcurrency: concurrency,
      });
      setRunOpen(false);
      toast.success(t('evals.experiment_started'));
      navigate(`/evals/experiments/${id}/${result.experimentId}`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRunning(false);
    }
  };

  if (!dataset) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => navigate('/evals/datasets')}
            >
              <IconArrowLeft size={16} />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">{dataset.name}</h2>
                <Badge variant="secondary">v{dataset.version}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {dataset.description || t('evals.no_description')}
              </p>
            </div>
          </div>
          <Button
            disabled={items.length === 0 || scorers.length === 0}
            onClick={openRun}
          >
            <IconPlayerPlay size={16} />
            {t('evals.run_experiment')}
          </Button>
        </div>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-4 border-b p-4">
            <div>
              <h3 className="font-medium">{t('evals.dataset_items')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('evals.item_count', { count: items.length })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void pickImportFile()}
              >
                <IconUpload size={15} />
                {t('common.import')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!items.length}
                onClick={() => void exportItems('csv')}
              >
                <IconDownload size={15} />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!items.length}
                onClick={() => void exportItems('jsonl')}
              >
                <IconDownload size={15} />
                JSONL
              </Button>
              <Button size="sm" onClick={openNewItem}>
                <IconPlus size={15} />
                {t('evals.add_item')}
              </Button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[42%]">{t('evals.input')}</TableHead>
                  <TableHead>{t('evals.ground_truth')}</TableHead>
                  <TableHead className="w-24 text-right">
                    {t('common.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <pre className="max-h-24 whitespace-pre-wrap text-xs">
                        {displayValue(item.input)}
                      </pre>
                    </TableCell>
                    <TableCell>
                      <pre className="max-h-24 whitespace-pre-wrap text-xs text-muted-foreground">
                        {displayValue(item.groundTruth)}
                      </pre>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => openEditItem(item)}
                      >
                        <IconEdit size={15} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void deleteItem(item.id)}
                      >
                        <IconTrash size={15} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!items.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-28 text-center text-muted-foreground"
                    >
                      {t('evals.empty_items')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h3 className="font-medium">{t('evals.experiments')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('evals.experiments_description')}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('evals.progress')}</TableHead>
                <TableHead>{t('evals.started_at')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((experiment) => (
                <TableRow key={experiment.id}>
                  <TableCell>
                    <Link
                      className="font-medium hover:underline"
                      to={`/evals/experiments/${id}/${experiment.id}`}
                    >
                      {experiment.name || experiment.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        experiment.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {t(`evals.status.${experiment.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {experiment.succeededCount + experiment.failedCount}/
                    {experiment.totalItems}
                  </TableCell>
                  <TableCell>{shortDate(experiment.startedAt)}</TableCell>
                </TableRow>
              ))}
              {!experiments.length ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t('evals.empty_experiments')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t('evals.edit_item') : t('evals.add_item')}
            </DialogTitle>
            <DialogDescription>{t('evals.item_editor_hint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t('evals.input')}</Label>
              <Textarea
                className="min-h-32 font-mono text-xs"
                value={itemInput}
                onChange={(event) => setItemInput(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('evals.ground_truth')}</Label>
              <Textarea
                className="min-h-24 font-mono text-xs"
                value={itemGroundTruth}
                onChange={(event) => setItemGroundTruth(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!itemInput.trim()}
              onClick={() => void saveItem()}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('evals.import_data')}</DialogTitle>
            <DialogDescription>{t('evals.import_hint')}</DialogDescription>
          </DialogHeader>
          <Select
            value={importFormat}
            onValueChange={(value) => setImportFormat(value as 'csv' | 'jsonl')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jsonl">JSONL</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            className="min-h-72 font-mono text-xs"
            value={importContent}
            onChange={(event) => setImportContent(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!importContent.trim()}
              onClick={() => void importItems()}
            >
              {t('common.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('evals.run_experiment')}</DialogTitle>
            <DialogDescription>
              {t('evals.run_experiment_hint')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t('common.name')}</Label>
              <Input
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t('evals.agent')}</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('evals.select_agent')} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t('evals.model')}</Label>
                <ChatModelSelect value={modelId} onChange={setModelId} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t('evals.concurrency')}</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('evals.scorers')}</Label>
              <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
                {scorers.map((scorer) => (
                  <label
                    key={scorer.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted"
                  >
                    <Checkbox
                      checked={selectedScorers.includes(scorer.id)}
                      onCheckedChange={(checked) =>
                        setSelectedScorers((current) =>
                          checked
                            ? [...new Set([...current, scorer.id])]
                            : current.filter(
                                (scorerId) => scorerId !== scorer.id,
                              ),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {scorer.name}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {scorer.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                running ||
                !runName.trim() ||
                !agentId ||
                !modelId ||
                !selectedScorers.length
              }
              onClick={() => void runExperiment()}
            >
              <IconPlayerPlay size={16} />
              {running ? t('common.loading') : t('evals.start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
