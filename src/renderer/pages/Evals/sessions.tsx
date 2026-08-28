/* eslint-disable no-void, jsx-a11y/label-has-associated-control */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { IconPlayerPlay } from '@tabler/icons-react';
import { EvalScorerInfo, EvalThreadScoreResult } from '@/types/evals';
import { Badge } from '@/renderer/components/ui/badge';
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
import { displayValue, shortDate } from './types';
import { useGlobal } from '@/renderer/hooks/use-global';

interface Thread {
  id: string;
  title?: string;
  updatedAt: string | Date;
  metadata?: Record<string, unknown>;
}

export default function SessionsPage() {
  const { t } = useTranslation();
  const { appInfo } = useGlobal();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState('');
  const [scorers, setScorers] = useState<EvalScorerInfo[]>([]);
  const [selectedScorers, setSelectedScorers] = useState<string[]>([]);
  const [results, setResults] = useState<EvalThreadScoreResult[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [threadPage, scorerList] = await Promise.all([
        window.electron.mastra.getThreads({ page: 0, size: 100 }),
        window.electron.evals.listScorers(),
      ]);
      setThreads(threadPage.items || []);
      setScorers(scorerList);
      if (threadPage.items?.[0]) setThreadId(threadPage.items[0].id);
      setSelectedScorers(
        scorerList
          .filter((scorer: EvalScorerInfo) => scorer.source === 'custom')
          .map((scorer: EvalScorerInfo) => scorer.id),
      );
    } catch (error) {
      toast.error(String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const score = async () => {
    if (!threadId || !selectedScorers.length) return;
    setRunning(true);
    setResults([]);
    try {
      const next = await window.electron.evals.scoreThread({
        threadId,
        scorerIds: selectedScorers,
        judgeModelId: appInfo?.defaultModel.model,
      });
      setResults(next);
      toast.success(t('evals.session_scored', { count: next.length }));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t('evals.history')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{t('evals.sessions')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('evals.sessions_description')}
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-5 rounded-xl border bg-card p-4 sm:p-5">
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid min-w-0 gap-2">
              <Label>{t('evals.session')}</Label>
              <Select value={threadId} onValueChange={setThreadId}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder={t('evals.select_session')} />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {threads.map((thread) => (
                    <SelectItem key={thread.id} value={thread.id}>
                      <span className="block max-w-[min(32rem,calc(100vw-5rem))] truncate">
                        {thread.title || thread.id} ·{' '}
                        {shortDate(thread.updatedAt)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-fit"
              disabled={running || !threadId || !selectedScorers.length}
              onClick={() => void score()}
            >
              <IconPlayerPlay size={16} />
              {running ? t('evals.scoring') : t('evals.score_session')}
            </Button>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label>{t('evals.scorers')}</Label>
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2">
              {scorers.map((scorer) => (
                <label
                  key={scorer.id}
                  className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md p-2 transition-colors hover:bg-muted"
                >
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={selectedScorers.includes(scorer.id)}
                    onCheckedChange={(checked) =>
                      setSelectedScorers((current) =>
                        checked
                          ? [...new Set([...current, scorer.id])]
                          : current.filter((id) => id !== scorer.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">
                      {scorer.name}
                    </span>
                    <span className="block break-words text-xs text-muted-foreground">
                      {scorer.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {results.length ? (
          <div className="grid gap-3">
            {results.map((result) => (
              <article
                key={result.assistantMessageId}
                className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 sm:p-5"
              >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
                  <div className="min-w-0 rounded-lg bg-muted/30 p-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('evals.input')}
                    </span>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">
                      {displayValue(result.input)}
                    </pre>
                  </div>
                  <div className="min-w-0 rounded-lg bg-muted/30 p-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('evals.output')}
                    </span>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">
                      {displayValue(result.output)}
                    </pre>
                  </div>
                </div>
                <div className="grid min-w-0 gap-2 border-t pt-4">
                  {result.scores.map((scoreResult) => (
                    <div
                      key={scoreResult.scorerId}
                      className="flex min-w-0 items-start justify-between gap-4 rounded-lg bg-muted/50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-sm font-medium">
                          {scoreResult.scorerId}
                        </div>
                        <p
                          className={`mt-1 break-words text-xs ${
                            scoreResult.error
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {scoreResult.error || scoreResult.reason || '—'}
                        </p>
                      </div>
                      <Badge
                        className="shrink-0"
                        variant={
                          scoreResult.score === null
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {scoreResult.score?.toFixed(2) ?? 'Error'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
