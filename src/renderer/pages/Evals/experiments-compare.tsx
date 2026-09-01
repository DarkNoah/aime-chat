/* eslint-disable no-void, no-continue, promise/always-return, jsx-a11y/label-has-associated-control */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/renderer/components/ui/button';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Label } from '@/renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/renderer/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { Badge } from '@/renderer/components/ui/badge';
import { DatasetRecord, Experiment, shortDate } from './types';

interface CompareResult {
  baselineId: string;
  items: Array<{
    itemId: string;
    results: Record<
      string,
      { output: unknown; scores: Record<string, number | null> } | null
    >;
  }>;
}

export default function ExperimentsComparePage() {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    window.electron.evals
      .listDatasets({ page: 0, perPage: 100 })
      .then((page) => {
        setDatasets(page.datasets || []);
        if (page.datasets?.[0]) setDatasetId(page.datasets[0].id);
      })
      .catch((error) => toast.error(String(error)));
  }, []);

  const loadExperiments = useCallback(async () => {
    if (!datasetId) return;
    try {
      const page = await window.electron.evals.listExperiments({
        datasetId,
        page: 0,
        perPage: 100,
      });
      const completed = (page.experiments || []).filter(
        (experiment: Experiment) => experiment.status === 'completed',
      );
      setExperiments(completed);
      setSelected([]);
      setResult(null);
    } catch (error) {
      toast.error(String(error));
    }
  }, [datasetId]);

  useEffect(() => {
    void loadExperiments();
  }, [loadExperiments]);

  const compare = async () => {
    if (selected.length !== 2) return;
    setComparing(true);
    try {
      setResult(
        await window.electron.evals.compareExperiments({
          experimentIds: selected,
          baselineId: selected[0],
        }),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setComparing(false);
    }
  };

  const { chartData, scorerIds } = useMemo(() => {
    if (!result) return { chartData: [], scorerIds: [] };
    const totals = new Map<
      string,
      Map<string, { sum: number; count: number }>
    >();
    for (const item of result.items) {
      for (const [experimentId, itemResult] of Object.entries(item.results)) {
        if (!itemResult) continue;
        if (!totals.has(experimentId)) totals.set(experimentId, new Map());
        const scorerMap = totals.get(experimentId)!;
        for (const [scorerId, score] of Object.entries(itemResult.scores)) {
          if (score === null) continue;
          const current = scorerMap.get(scorerId) || { sum: 0, count: 0 };
          current.sum += score;
          current.count += 1;
          scorerMap.set(scorerId, current);
        }
      }
    }
    const allScorers = [
      ...new Set([...totals.values()].flatMap((map) => [...map.keys()])),
    ];
    return {
      scorerIds: allScorers,
      chartData: allScorers.map((scorerId) => {
        const row: Record<string, string | number> = { scorerId };
        for (const experimentId of selected) {
          const value = totals.get(experimentId)?.get(scorerId);
          row[experimentId] = value ? value.sum / value.count : 0;
        }
        return row;
      }),
    };
  }, [result, selected]);

  const config = useMemo(
    () =>
      Object.fromEntries(
        selected.map((id, index) => [
          id,
          {
            label: experiments.find((item) => item.id === id)?.name || id,
            color: `var(--chart-${index + 1})`,
          },
        ]),
      ) satisfies ChartConfig,
    [experiments, selected],
  );

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t('evals.analysis')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{t('evals.compare')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('evals.compare_description')}
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border bg-card p-4">
          <div className="grid gap-2">
            <Label>{t('evals.dataset')}</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="max-w-lg">
                <SelectValue placeholder={t('evals.select_dataset')} />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t('evals.select_two_experiments')}</Label>
            <div className="grid gap-2 md:grid-cols-2">
              {experiments.map((experiment) => (
                <label
                  key={experiment.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(experiment.id)}
                    disabled={
                      !selected.includes(experiment.id) && selected.length >= 2
                    }
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, experiment.id]
                          : current.filter((id) => id !== experiment.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {experiment.name || experiment.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {shortDate(experiment.startedAt)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button
            className="w-fit"
            disabled={selected.length !== 2 || comparing}
            onClick={() => void compare()}
          >
            {comparing ? t('common.loading') : t('evals.compare_now')}
          </Button>
        </div>

        {result && chartData.length ? (
          <>
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-4 font-medium">{t('evals.average_scores')}</h3>
              <ChartContainer config={config} className="h-72 w-full">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="scorerId" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 1]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {selected.map((id, index) => (
                    <Bar
                      key={id}
                      dataKey={id}
                      fill={`var(--chart-${index + 1})`}
                      radius={4}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            </div>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('evals.scorer')}</TableHead>
                    {selected.map((id) => (
                      <TableHead key={id}>
                        {experiments.find((item) => item.id === id)?.name || id}
                      </TableHead>
                    ))}
                    <TableHead>{t('evals.delta')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scorerIds.map((scorerId) => {
                    const row = chartData.find(
                      (item) => item.scorerId === scorerId,
                    )!;
                    const first = Number(row[selected[0]] || 0);
                    const second = Number(row[selected[1]] || 0);
                    const delta = second - first;
                    return (
                      <TableRow key={scorerId}>
                        <TableCell className="font-medium">
                          {scorerId}
                        </TableCell>
                        <TableCell>{first.toFixed(3)}</TableCell>
                        <TableCell>{second.toFixed(3)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={delta < 0 ? 'destructive' : 'secondary'}
                          >
                            {delta > 0 ? '+' : ''}
                            {delta.toFixed(3)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
