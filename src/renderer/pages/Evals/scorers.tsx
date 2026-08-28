/* eslint-disable no-void, no-alert */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  IconEdit,
  IconPlus,
  IconTestPipe,
  IconTrash,
} from '@tabler/icons-react';
import {
  EvalCheckConfig,
  EvalCheckType,
  EvalLlmJudgeConfig,
  EvalOutputField,
  EvalScorerInfo,
  EvalScorerInput,
} from '@/types/evals';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
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

const checkTypes: EvalCheckType[] = [
  'completeness',
  'includes',
  'excludes',
  'equals',
  'matches',
  'similarity',
  'calledTool',
  'didNotCall',
  'toolOrder',
  'maxToolCalls',
  'usedNoTools',
  'noToolErrors',
];

const emptyLlmConfig = (): EvalLlmJudgeConfig => ({
  judgeModelId: '',
  instructions: 'You are a strict and fair evaluator.',
  analyzePrompt:
    'Evaluate the assistant response against the user input.\\n\\nUser input:\\n{{input}}\\n\\nAssistant response:\\n{{output}}\\n\\nReference answer:\\n{{groundTruth}}',
  outputFields: [
    {
      key: 'score',
      type: 'number',
      description: 'Quality score between 0 and 1',
    },
  ],
  scoreExpression: 'score',
  reasonPrompt:
    'Explain the evaluation briefly. Score: {{score}}. Analysis: {{analysis}}',
});

const emptyCheckConfig = (): EvalCheckConfig => ({
  checkType: 'includes',
  params: { value: '' },
});

export default function ScorersPage() {
  const { t } = useTranslation();
  const [scorers, setScorers] = useState<EvalScorerInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EvalScorerInput>({
    name: '',
    description: '',
    kind: 'llm_judge',
    config: emptyLlmConfig(),
  });
  const [fieldsText, setFieldsText] = useState(
    JSON.stringify(emptyLlmConfig().outputFields, null, 2),
  );
  const [testInput, setTestInput] = useState('What is 2 + 2?');
  const [testOutput, setTestOutput] = useState('2 + 2 equals 4.');
  const [testGroundTruth, setTestGroundTruth] = useState('4');
  const [testResult, setTestResult] = useState<{
    score: number | null;
    reason?: string | null;
    error?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setScorers(await window.electron.evals.listScorers());
    } catch (error) {
      toast.error(String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const newScorer = () => {
    const config = emptyLlmConfig();
    setForm({
      name: '',
      description: '',
      kind: 'llm_judge',
      config,
    });
    setFieldsText(JSON.stringify(config.outputFields, null, 2));
    setTestResult(null);
    setOpen(true);
  };

  const editScorer = (scorer: EvalScorerInfo) => {
    if (scorer.source !== 'custom') return;
    setForm({
      id: scorer.id,
      name: scorer.name,
      description: scorer.description,
      kind: scorer.kind,
      config: scorer.config,
    });
    setFieldsText(
      JSON.stringify(
        scorer.kind === 'llm_judge'
          ? (scorer.config as EvalLlmJudgeConfig).outputFields
          : [],
        null,
        2,
      ),
    );
    setTestResult(null);
    setOpen(true);
  };

  const normalizedForm = (): EvalScorerInput => {
    if (form.kind === 'check') return form;
    const config = form.config as EvalLlmJudgeConfig;
    return {
      ...form,
      config: {
        ...config,
        outputFields: JSON.parse(fieldsText) as EvalOutputField[],
      },
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.electron.evals.saveScorer(normalizedForm());
      setOpen(false);
      toast.success(t('evals.scorer_saved'));
      await load();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await window.electron.evals.testScorer({
          scorer: normalizedForm(),
          input: testInput,
          output: testOutput,
          groundTruth: testGroundTruth || undefined,
        }),
      );
    } catch (error) {
      setTestResult({ score: null, error: String(error) });
    } finally {
      setTesting(false);
    }
  };

  const remove = async (scorer: EvalScorerInfo) => {
    if (!window.confirm(t('evals.confirm_delete_scorer'))) return;
    try {
      await window.electron.evals.deleteScorer(scorer.id);
      await load();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const setKind = (kind: 'llm_judge' | 'check') => {
    const config = kind === 'llm_judge' ? emptyLlmConfig() : emptyCheckConfig();
    setForm((current) => ({ ...current, kind, config }));
    if (kind === 'llm_judge') {
      setFieldsText(
        JSON.stringify((config as EvalLlmJudgeConfig).outputFields, null, 2),
      );
    }
  };

  const updateLlm = (patch: Partial<EvalLlmJudgeConfig>) =>
    setForm((current) => ({
      ...current,
      config: { ...(current.config as EvalLlmJudgeConfig), ...patch },
    }));

  const updateCheck = (
    patch: Partial<EvalCheckConfig>,
    params?: Record<string, unknown>,
  ) =>
    setForm((current) => ({
      ...current,
      config: {
        ...(current.config as EvalCheckConfig),
        ...patch,
        ...(params
          ? {
              params: {
                ...((current.config as EvalCheckConfig).params || {}),
                ...params,
              },
            }
          : {}),
      },
    }));

  const checkConfig = form.config as EvalCheckConfig;
  const llmConfig = form.config as EvalLlmJudgeConfig;
  const checkNeedsValue = [
    'includes',
    'excludes',
    'equals',
    'similarity',
  ].includes(checkConfig.checkType);
  const checkNeedsTool = ['calledTool', 'didNotCall'].includes(
    checkConfig.checkType,
  );

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('evals.quality_rules')}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {t('evals.scorers')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t('evals.scorers_description')}
            </p>
          </div>
          <Button className="shrink-0" onClick={newScorer}>
            <IconPlus size={16} />
            {t('evals.new_scorer')}
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('evals.type')}</TableHead>
                <TableHead>{t('evals.source')}</TableHead>
                <TableHead>{t('evals.direction')}</TableHead>
                <TableHead className="w-24 text-right">
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorers.map((scorer) => (
                <TableRow key={scorer.id}>
                  <TableCell className="min-w-64 whitespace-normal">
                    <div className="break-words font-medium">{scorer.name}</div>
                    <div className="max-w-xl break-words text-xs text-muted-foreground">
                      {scorer.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t(`evals.kind.${scorer.kind}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {t(`evals.source_value.${scorer.source}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t(`evals.score_direction.${scorer.scoreDirection}`)}
                  </TableCell>
                  <TableCell className="text-right">
                    {scorer.source === 'custom' ? (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => editScorer(scorer)}
                        >
                          <IconEdit size={15} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void remove(scorer)}
                        >
                          <IconTrash size={15} />
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
          <DialogHeader className="pr-6">
            <DialogTitle>
              {form.id ? t('evals.edit_scorer') : t('evals.new_scorer')}
            </DialogTitle>
            <DialogDescription>{t('evals.scorer_form_hint')}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-5 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t('common.name')}</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('evals.type')}</Label>
                <Select value={form.kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llm_judge">
                      {t('evals.kind.llm_judge')}
                    </SelectItem>
                    <SelectItem value="check">
                      {t('evals.kind.check')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t('common.description')}</Label>
              <Input
                value={form.description || ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            {form.kind === 'llm_judge' ? (
              <>
                <div className="grid gap-2">
                  <Label>{t('evals.judge_model')}</Label>
                  <ChatModelSelect
                    value={llmConfig.judgeModelId}
                    onChange={(judgeModelId) => updateLlm({ judgeModelId })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('evals.judge_instructions')}</Label>
                  <Textarea
                    value={llmConfig.instructions}
                    onChange={(event) =>
                      updateLlm({ instructions: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('evals.analyze_prompt')}</Label>
                  <Textarea
                    className="min-h-32 font-mono text-xs"
                    value={llmConfig.analyzePrompt}
                    onChange={(event) =>
                      updateLlm({ analyzePrompt: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {'{{input}} · {{output}} · {{groundTruth}}'}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{t('evals.output_fields')}</Label>
                    <Textarea
                      className="min-h-32 font-mono text-xs"
                      value={fieldsText}
                      onChange={(event) => setFieldsText(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('evals.score_expression')}</Label>
                    <Input
                      className="font-mono"
                      value={llmConfig.scoreExpression}
                      onChange={(event) =>
                        updateLlm({ scoreExpression: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('evals.score_expression_hint')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{t('evals.reason_prompt')}</Label>
                  <Textarea
                    value={llmConfig.reasonPrompt || ''}
                    onChange={(event) =>
                      updateLlm({ reasonPrompt: event.target.value })
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>{t('evals.check_type')}</Label>
                  <Select
                    value={checkConfig.checkType}
                    onValueChange={(checkType) =>
                      updateCheck({ checkType: checkType as EvalCheckType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {checkTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {checkNeedsValue ? (
                  <div className="grid gap-2">
                    <Label>{t('evals.expected_value')}</Label>
                    <Input
                      value={String(checkConfig.params?.value || '')}
                      onChange={(event) =>
                        updateCheck({}, { value: event.target.value })
                      }
                    />
                  </div>
                ) : null}
                {checkConfig.checkType === 'matches' ? (
                  <div className="grid gap-2">
                    <Label>{t('evals.pattern')}</Label>
                    <Input
                      value={String(checkConfig.params?.pattern || '')}
                      onChange={(event) =>
                        updateCheck({}, { pattern: event.target.value })
                      }
                    />
                  </div>
                ) : null}
                {checkNeedsTool ? (
                  <div className="grid gap-2">
                    <Label>{t('evals.tool_name')}</Label>
                    <Input
                      value={String(checkConfig.params?.toolName || '')}
                      onChange={(event) =>
                        updateCheck({}, { toolName: event.target.value })
                      }
                    />
                  </div>
                ) : null}
                {checkConfig.checkType === 'toolOrder' ? (
                  <div className="grid gap-2">
                    <Label>{t('evals.tool_order')}</Label>
                    <Input
                      placeholder="search, read, write"
                      value={
                        Array.isArray(checkConfig.params?.tools)
                          ? checkConfig.params.tools.join(', ')
                          : ''
                      }
                      onChange={(event) =>
                        updateCheck(
                          {},
                          {
                            tools: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          },
                        )
                      }
                    />
                  </div>
                ) : null}
                {checkConfig.checkType === 'maxToolCalls' ? (
                  <div className="grid gap-2">
                    <Label>{t('evals.max_tool_calls')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={Number(checkConfig.params?.max || 0)}
                      onChange={(event) =>
                        updateCheck({}, { max: Number(event.target.value) })
                      }
                    />
                  </div>
                ) : null}
              </>
            )}

            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 font-medium">
                <IconTestPipe size={16} />
                {t('evals.test_scorer')}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Textarea
                  placeholder={t('evals.input')}
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                />
                <Textarea
                  placeholder={t('evals.output')}
                  value={testOutput}
                  onChange={(event) => setTestOutput(event.target.value)}
                />
                <Textarea
                  placeholder={t('evals.ground_truth')}
                  value={testGroundTruth}
                  onChange={(event) => setTestGroundTruth(event.target.value)}
                />
              </div>
              <div className="flex items-start gap-3">
                <Button
                  className="shrink-0"
                  size="sm"
                  variant="outline"
                  disabled={testing || !form.name.trim()}
                  onClick={() => void test()}
                >
                  {testing ? t('common.loading') : t('evals.run_test')}
                </Button>
                {testResult ? (
                  <span
                    className={`min-w-0 flex-1 break-words text-sm ${
                      testResult.error ? 'text-destructive' : ''
                    }`}
                  >
                    {testResult.error ||
                      `${t('evals.score')}: ${testResult.score?.toFixed(3)} ${
                        testResult.reason || ''
                      }`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={saving || !form.name.trim()}
              onClick={() => void save()}
            >
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
