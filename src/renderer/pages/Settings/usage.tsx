/* eslint-disable no-nested-ternary */
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IconChevronDown,
  IconChevronUp,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/renderer/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/renderer/components/ui/table';
import { Button } from '@/renderer/components/ui/button';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';

type DaySummary = {
  day: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalCostsUsd: number;
};

type ResourceSummary = {
  resourceId: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalCostsUsd: number;
};

type ModelSummary = {
  modelId: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalCostsUsd: number;
};

type UsageSummary = {
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalCostsUsd: number;
  firstAt?: string;
  lastAt?: string;
  byDay: DaySummary[];
  byResourceId: ResourceSummary[];
  byModelId: ModelSummary[];
};

type UsageSummaryResponse = {
  rows: any[];
  summary: UsageSummary;
};

const formatCompact = (n?: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n ?? 0);

const formatUsd = (n?: number) => {
  const v = n ?? 0;
  if (v === 0) return '$0';
  if (Math.abs(v) < 0.01) return `$${v.toFixed(6)}`;
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

export default function Usage() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  setTitle(t('settings.usage'));

  const [data, setData] = useState<UsageSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = (await window.electron.mastra.getUsageSummary(
        {},
      )) as UsageSummaryResponse;
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? 'Load usage failed');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      inputTokens: { label: 'Input', color: 'var(--color-chart-1)' },
      outputTokens: { label: 'Output', color: 'var(--color-chart-2)' },
      totalTokens: { label: 'Total', color: 'var(--color-chart-3)' },
      totalCostsUsd: { label: 'Cost ($)', color: 'var(--color-chart-4)' },
    }),
    [],
  );

  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [resourcesExpanded, setResourcesExpanded] = useState(false);

  const TABLE_LIMIT = 10;

  const summary = data?.summary;
  const series = summary?.byDay ?? [];
  const resources = summary?.byResourceId ?? [];
  const models = summary?.byModelId ?? [];

  const visibleModels = modelsExpanded ? models : models.slice(0, TABLE_LIMIT);
  const visibleResources = resourcesExpanded
    ? resources
    : resources.slice(0, TABLE_LIMIT);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {summary?.firstAt ? (
              <>
                {formatDateTime(summary.firstAt)} →{' '}
                {formatDateTime(summary.lastAt)}
              </>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={isLoading}
            onClick={reload}
          >
            <IconRefresh
              className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {isLoading && !data ? (
          <div className="flex items-center justify-center py-12">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card>
                <CardHeader className="gap-1 pb-2">
                  <CardTitle className="text-sm">Total Tokens</CardTitle>
                  <CardDescription>Input + Output + Cached</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold flex flex-col gap-1">
                  {formatCompact(summary?.totalTokens)}
                  <small className="text-xs text-muted-foreground font-normal">
                    {formatCompact(summary?.inputTokens)} in ·{' '}
                    {formatCompact(summary?.outputTokens)} out ·{' '}
                    {formatCompact(summary?.cachedInputTokens)} cached
                  </small>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-1 pb-2">
                  <CardTitle className="text-sm">Total Cost</CardTitle>
                  <CardDescription>USD</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatUsd(summary?.totalCostsUsd)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-1 pb-2">
                  <CardTitle className="text-sm">Requests</CardTitle>
                  <CardDescription>API Calls</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatCompact(summary?.count)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-1 pb-2">
                  <CardTitle className="text-sm">Reasoning</CardTitle>
                  <CardDescription>Thinking Tokens</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatCompact(summary?.reasoningTokens)}
                </CardContent>
              </Card>
            </div>

            {/* Daily token usage chart */}
            {series.length > 0 && (
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="text-sm">Token Usage by Day</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer className="h-56 w-full" config={chartConfig}>
                    <AreaChart data={series} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickMargin={8}
                        minTickGap={24}
                        tickFormatter={(v) =>
                          typeof v === 'string' && v.length >= 10
                            ? v.slice(5)
                            : v
                        }
                      />
                      <YAxis
                        tickMargin={8}
                        tickFormatter={(v) => formatCompact(v)}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelKey="day"
                            indicator="dot"
                            formatter={(value) =>
                              formatCompact(value as number)
                            }
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area
                        dataKey="inputTokens"
                        type="monotone"
                        stackId="a"
                        fill="var(--color-inputTokens)"
                        stroke="var(--color-inputTokens)"
                        fillOpacity={0.35}
                      />
                      <Area
                        dataKey="outputTokens"
                        type="monotone"
                        stackId="a"
                        fill="var(--color-outputTokens)"
                        stroke="var(--color-outputTokens)"
                        fillOpacity={0.35}
                      />
                      <Line
                        dataKey="totalTokens"
                        type="monotone"
                        stroke="var(--color-totalTokens)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Daily cost chart */}
            {series.length > 0 && (
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="text-sm">Cost by Day (USD)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer className="h-40 w-full" config={chartConfig}>
                    <AreaChart data={series} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickMargin={8}
                        minTickGap={24}
                        tickFormatter={(v) =>
                          typeof v === 'string' && v.length >= 10
                            ? v.slice(5)
                            : v
                        }
                      />
                      <YAxis
                        tickMargin={8}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => {
                          if (v === 0) return '$0';
                          if (Math.abs(v) < 0.0001)
                            return `$${v.toExponential(1)}`;
                          if (Math.abs(v) < 0.01) return `$${v.toFixed(5)}`;
                          if (Math.abs(v) < 1) return `$${v.toFixed(3)}`;
                          return `$${v.toFixed(2)}`;
                        }}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelKey="day"
                            indicator="dot"
                            formatter={(value) => {
                              const v = typeof value === 'number' ? value : 0;
                              return v < 0.01
                                ? `$${v.toFixed(6)}`
                                : `$${v.toFixed(4)}`;
                            }}
                          />
                        }
                      />
                      <Area
                        dataKey="totalCostsUsd"
                        type="monotone"
                        fill="var(--color-totalCostsUsd)"
                        stroke="var(--color-totalCostsUsd)"
                        fillOpacity={0.4}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* By Model table */}
            {models.length > 0 && (
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="text-sm">Usage by Model</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Input</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Reasoning</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleModels.map((m) => (
                        <TableRow key={m.modelId}>
                          <TableCell className="font-medium truncate max-w-[200px]">
                            {m.modelId}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(m.count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(m.inputTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(m.outputTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(m.reasoningTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(m.totalTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUsd(m.totalCostsUsd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {models.length > TABLE_LIMIT && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full rounded-none border-t"
                      onClick={() => setModelsExpanded((v) => !v)}
                    >
                      {modelsExpanded ? (
                        <IconChevronUp className="size-4 mr-1" />
                      ) : (
                        <IconChevronDown className="size-4 mr-1" />
                      )}
                      {modelsExpanded
                        ? t('common.collapse', 'Collapse')
                        : t('common.showAll', `Show all ${models.length}`)}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* By Resource table */}
            {resources.length > 0 && (
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="text-sm">Usage by Resource</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Input</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleResources.map((r) => (
                        <TableRow key={r.resourceId}>
                          <TableCell className="font-medium truncate max-w-[200px]">
                            {r.resourceId}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(r.count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(r.inputTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(r.outputTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCompact(r.totalTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUsd(r.totalCostsUsd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {resources.length > TABLE_LIMIT && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full rounded-none border-t"
                      onClick={() => setResourcesExpanded((v) => !v)}
                    >
                      {resourcesExpanded ? (
                        <IconChevronUp className="size-4 mr-1" />
                      ) : (
                        <IconChevronDown className="size-4 mr-1" />
                      )}
                      {resourcesExpanded
                        ? t('common.collapse', 'Collapse')
                        : t('common.showAll', `Show all ${resources.length}`)}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {!isLoading && !summary?.count && (
              <div className="text-center text-sm text-muted-foreground py-12">
                No usage data yet.
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
