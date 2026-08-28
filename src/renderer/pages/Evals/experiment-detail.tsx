/* eslint-disable no-void, prefer-destructuring */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EvalsChannel } from '@/types/ipc-channel';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
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
import { Experiment, ExperimentResult, displayValue, shortDate } from './types';

interface ExperimentDetail {
  experiment: Experiment | null;
  results: ExperimentResult[];
  scoreSummary: Record<
    string,
    { total: number; count: number; average: number }
  >;
}

const chartConfig = {
  average: {
    label: 'Average score',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export default function ExperimentDetailPage() {
  const { datasetId = '', experimentId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!datasetId || !experimentId) return;
    setLoading(true);
    try {
      setDetail(
        await window.electron.evals.getExperiment({
          datasetId,
          experimentId,
        }),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, [datasetId, experimentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      window.electron.ipcRenderer.on(
        EvalsChannel.ExperimentProgress,
        (payload: unknown) => {
          const progress = payload as { experimentId?: string };
          if (progress.experimentId === experimentId) void load();
        },
      ),
    [experimentId, load],
  );

  const chartData = useMemo(
    () =>
      Object.entries(detail?.scoreSummary || {}).map(([scorerId, value]) => ({
        scorerId,
        average: Number(value.average.toFixed(3)),
      })),
    [detail?.scoreSummary],
  );

  if (!detail?.experiment) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {loading ? t('common.loading') : t('evals.experiment_not_found')}
      </div>
    );
  }

  const experiment = detail.experiment;
  const completed = experiment.succeededCount + experiment.failedCount;
  const successRate = experiment.totalItems
    ? Math.round((experiment.succeededCount / experiment.totalItems) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => navigate(`/evals/datasets/${datasetId}`)}
            >
              <IconArrowLeft size={16} />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">
                  {experiment.name || experiment.id}
                </h2>
                <Badge
                  variant={
                    experiment.status === 'failed' ? 'destructive' : 'secondary'
                  }
                >
                  {t(`evals.status.${experiment.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {experiment.description || t('evals.no_description')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <IconRefresh size={15} />
            {t('common.refresh')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('evals.progress')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {completed}/{experiment.totalItems}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('evals.success_rate')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {successRate}%
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('evals.failed_items')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {experiment.failedCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('evals.started_at')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-medium">
              {shortDate(experiment.startedAt)}
            </CardContent>
          </Card>
        </div>

        {chartData.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('evals.average_scores')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 12 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} />
                  <YAxis
                    type="category"
                    dataKey="scorerId"
                    width={160}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="average"
                    fill="var(--color-average)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        ) : null}

        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h3 className="font-medium">{t('evals.item_results')}</h3>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('evals.input')}</TableHead>
                  <TableHead>{t('evals.output')}</TableHead>
                  <TableHead>{t('evals.scores')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.results.map((result) => (
                  <TableRow
                    key={result.id}
                    className={result.error ? 'bg-destructive/5' : undefined}
                  >
                    <TableCell className="max-w-xs align-top">
                      <pre className="max-h-36 whitespace-pre-wrap text-xs">
                        {displayValue(result.input)}
                      </pre>
                    </TableCell>
                    <TableCell className="max-w-md align-top">
                      {result.error ? (
                        <p className="text-xs text-destructive">
                          {result.error.message}
                        </p>
                      ) : (
                        <pre className="max-h-36 whitespace-pre-wrap text-xs">
                          {displayValue(result.output)}
                        </pre>
                      )}
                    </TableCell>
                    <TableCell className="min-w-64 align-top">
                      <div className="grid gap-2">
                        {result.scores.map((score) => (
                          <div
                            key={score.id}
                            className="rounded-md border bg-background p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium">
                                {score.scorerId}
                              </span>
                              <Badge variant="outline">
                                {score.score.toFixed(2)}
                              </Badge>
                            </div>
                            {score.reason ? (
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                                {score.reason}
                              </p>
                            ) : null}
                          </div>
                        ))}
                        {!result.scores.length ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
