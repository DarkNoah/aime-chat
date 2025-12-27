/* eslint-disable no-nested-ternary */
import React, {
  ForwardedRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import { Button } from '../../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../ui/chart';

type UsageRow = {
  id: string;
  thread_id: string;
  resource_id: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_input_tokens?: number;
  createdAt: string;
};

type UsageSummary = {
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  firstAt?: string;
  lastAt?: string;
  byDay: Array<{
    day: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
  }>;
  byResourceId: Array<{
    resourceId: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
  }>;
};

type UsageSummaryResponse = {
  rows: UsageRow[];
  summary: UsageSummary;
};

export type ChatUsageViewProps = {
  className?: string;
  threadId?: string;
  resourceId?: string;
};

export interface ChatUsageViewRef {}

export const ChatUsageView = React.forwardRef<
  ChatUsageViewRef,
  ChatUsageViewProps
>((props: ChatUsageViewProps, ref: ForwardedRef<ChatUsageViewRef>) => {
  const { className, threadId, resourceId } = props;
  const [data, setData] = useState<UsageSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!threadId && !resourceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await window.electron.mastra.getUsageSummary({
        threadId,
        resourceId,
      })) as UsageSummaryResponse;
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? '加载 usage 失败');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [threadId, resourceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      inputTokens: { label: 'Input', color: 'var(--color-chart-1)' },
      outputTokens: { label: 'Output', color: 'var(--color-chart-2)' },
      totalTokens: { label: 'Total', color: 'var(--color-chart-3)' },
    }),
    [],
  );

  const summary = data?.summary;
  const series = summary?.byDay ?? [];

  const formatCompact = (n?: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n ?? 0);

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

  if (!threadId && !resourceId) {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">
          未选择线程，无法展示 Usage。
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 p-4">
        <div></div>
        <Button size="sm" variant="secondary" onClick={() => reload()}>
          刷新
        </Button>
      </div>

      {error ? (
        <div className="px-4 pb-4 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 px-4 pb-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm">Total Tokens</CardTitle>
            <CardDescription>Input + Output + Cached</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold flex flex-col gap-2">
            {formatCompact(summary?.totalTokens)}
            <small className="text-xs text-muted-foreground">
              {formatCompact(summary?.inputTokens)} +{' '}
              {formatCompact(summary?.outputTokens)} +{' '}
              {formatCompact(summary?.cachedInputTokens)}
            </small>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 pb-6">
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm">按天趋势</CardTitle>
            <CardDescription>
              {summary?.firstAt ? (
                <>
                  {formatDateTime(summary.firstAt)} →{' '}
                  {formatDateTime(summary.lastAt)}
                </>
              ) : (
                '暂无数据'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : series.length ? (
              <ChartContainer className="h-64 w-full" config={chartConfig}>
                <AreaChart data={series} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={(v) =>
                      typeof v === 'string' && v.length >= 10 ? v.slice(5) : v
                    }
                  />
                  <YAxis tickMargin={8} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent labelKey="day" indicator="dot" />
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
            ) : (
              <div className="text-sm text-muted-foreground">
                暂无 usage 数据。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
