import React, { useState, useCallback } from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/renderer/components/ui/card';
import { Input } from '@/renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/renderer/components/ui/form';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { CreateProvider, Provider, ProviderModel } from '@/types/provider';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Check,
  SkipForward,
  Search,
  Package,
} from 'lucide-react';
import { ModelSelectorLogo } from '@/renderer/components/ai-elements/model-selector';
import modelsData from '@/../assets/models.json';
import toast from 'react-hot-toast';
import { Spinner } from '@/renderer/components/ui/spinner';
import { Switch } from '@/renderer/components/ui/switch';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import {
  Item,
  ItemContent,
  ItemActions,
  ItemTitle,
  ItemDescription,
} from '@/renderer/components/ui/item';
import { Badge } from '@/renderer/components/ui/badge';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import { InputPassword } from '@/renderer/components/ui/input-password';

interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

// 步骤枚举
type ProviderSetupStep = 'form' | 'models' | 'complete';

function ProviderStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<ProviderSetupStep>('form');
  const [createdProvider, setCreatedProvider] = useState<Provider | null>(null);

  // 模型相关状态
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [search, setSearch] = useState('');

  const form = useForm<CreateProvider>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      type: '',
      isActive: true,
      apiBase: '',
      apiKey: '',
    },
  });

  const selectedType = form.watch('type');

  // 加载模型列表
  const loadModels = async (providerId: string) => {
    setLoadingModels(true);
    try {
      const list = await window.electron.providers.getModelList(providerId);
      setModels(list || []);
    } catch (err: any) {
      toast.error(t('setup.provider.load_models_error'));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSubmit = async (data: CreateProvider) => {
    setSubmitting(true);
    try {
      const provider = await window.electron.providers.create(data);
      setCreatedProvider(provider);
      // 创建成功后加载模型列表
      await loadModels(provider.id);
      setStep('models');
    } catch (err: any) {
      if (err.message.includes('Error: Provider already exists')) {
        toast.error(t('setup.provider.already_exists'));
      } else {
        toast.error(err.message || t('setup.provider.added_error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 保存模型并完成
  const handleSaveModels = async () => {
    if (!createdProvider) return;
    setSavingModels(true);
    try {
      await window.electron.providers.updateModels(createdProvider.id, models);
      toast.success(t('setup.provider.added_success'));
      setStep('complete');
    } catch (err: any) {
      toast.error(err.message || t('setup.provider.save_models_error'));
    } finally {
      setSavingModels(false);
    }
  };

  // 切换模型启用状态
  const toggleModelActive = (modelId: string, isActive: boolean) => {
    setModels((list) =>
      list.map((m) => (m.id === modelId ? { ...m, isActive } : m)),
    );
  };

  // 快速启用推荐模型
  const enableRecommendedModels = () => {
    const recommendedKeywords = [
      'gpt-5.2',
      'claude-ops-4.5',
      'gemini-3',
      'deepseek-chat',
      'glm-4.7',
    ];
    setModels((list) =>
      list.map((m) => ({
        ...m,
        isActive: recommendedKeywords.some(
          (keyword) =>
            m.id.toLowerCase().includes(keyword) ||
            m.name.toLowerCase().includes(keyword),
        ),
      })),
    );
  };

  // 重置表单开始添加新供应商
  const startAddAnother = () => {
    form.reset();
    setCreatedProvider(null);
    setModels([]);
    setStep('form');
  };

  // 过滤后的模型列表
  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase()),
  );

  // 已启用模型数量
  const enabledCount = models.filter((m) => m.isActive).length;

  const renderApiDoc = useCallback(() => {
    const doc = modelsData[selectedType]?.doc;
    if (!doc) return null;
    return (
      <FormDescription className="truncate">
        <a
          href={doc}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {t('setup.provider.get_api_key')}
        </a>
      </FormDescription>
    );
  }, [selectedType, t]);

  // Popular providers for quick selection
  const popularProviders = ['openai', 'anthropic', 'google', 'deepseek'];

  // 渲染表单步骤
  const renderFormStep = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Provider Type Selection */}
        <FormField
          control={form.control}
          name="type"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('setup.provider.type')}</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (modelsData[v]) {
                      form.setValue('name', modelsData[v].name);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t('setup.provider.select_type')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t('setup.provider.popular')}</SelectLabel>
                      {popularProviders.map((id) => (
                        <SelectItem key={id} value={id}>
                          <ModelSelectorLogo provider={id} />
                          {modelsData[id]?.name || id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        {t('setup.provider.all_providers')}
                      </SelectLabel>
                      {Object.values(modelsData)
                        .filter((m: any) => !popularProviders.includes(m.id))
                        .sort((x: any, y: any) => x.name.localeCompare(y.name))
                        .map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <ModelSelectorLogo provider={m.id} />
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Provider Name */}
        <FormField
          control={form.control}
          name="name"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('setup.provider.name')}</FormLabel>
              <FormControl>
                <Input placeholder="My OpenAI" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* API Base (Optional) */}
        <FormField
          control={form.control}
          name="apiBase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                API Base{' '}
                <span className="text-muted-foreground text-xs">
                  ({t('common.optional')})
                </span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={modelsData[selectedType]?.api || ''}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* API Key */}
        <FormField
          control={form.control}
          name="apiKey"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <InputPassword placeholder="sk-..." {...field} />
              </FormControl>
              {renderApiDoc()}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={!form.formState.isValid || submitting}
        >
          {submitting ? (
            <>
              <Spinner className="w-4 h-4 mr-2" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              {t('setup.provider.add_provider')}
            </>
          )}
        </Button>
      </form>
    </Form>
  );

  // 渲染模型选择步骤
  const renderModelsStep = () => (
    <div className="space-y-4">
      {/* 搜索和操作栏 */}
      <div className="flex flex-row gap-2 items-center">
        <InputGroup className="flex-1">
          <InputGroupInput
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <InputGroupAddon>
            <Search className="w-4 h-4" />
          </InputGroupAddon>
        </InputGroup>
        <Button variant="outline" onClick={enableRecommendedModels}>
          {t('setup.provider.enable_recommended')}
        </Button>
      </div>

      {/* 已启用数量 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t('setup.provider.models_count', {
            enabled: enabledCount,
            total: models.length,
          })}
        </span>
      </div>

      {/* 模型列表 */}
      {loadingModels ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="w-8 h-8" />
        </div>
      ) : (
        <ScrollArea className="h-[300px] rounded-md border">
          <div className="p-2 space-y-1">
            {filteredModels
              .sort((a, b) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((m) => (
                <Item key={m.id} variant="default" size="sm">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="text-sm truncate">{m.name}</ItemTitle>
                    <ItemDescription className="text-xs truncate">
                      {m.id}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      checked={!!m.isActive}
                      onCheckedChange={(v) => toggleModelActive(m.id, v)}
                    />
                  </ItemActions>
                </Item>
              ))}
          </div>
        </ScrollArea>
      )}

      {/* 提示信息 */}
      <p className="text-sm text-muted-foreground">
        {t('setup.provider.models_tip')}
      </p>
    </div>
  );

  // 渲染完成步骤
  const renderCompleteStep = () => (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
        <Check className="w-8 h-8 text-green-500" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="font-medium text-lg">
          {t('setup.provider.added_title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('setup.provider.added_description')}
        </p>
        {enabledCount > 0 && (
          <Badge variant="secondary">
            {t('setup.provider.enabled_models', { count: enabledCount })}
          </Badge>
        )}
      </div>
      <Button variant="outline" onClick={startAddAnother}>
        <Plus className="w-4 h-4 mr-2" />
        {t('setup.provider.add_another')}
      </Button>
    </div>
  );

  // 获取当前步骤的标题和描述
  const getStepHeader = () => {
    switch (step) {
      case 'models':
        return {
          title: t('setup.provider.models_title'),
          description: t('setup.provider.models_description'),
        };
      default:
        return {
          title: t('setup.provider.title'),
          description: t('setup.provider.description'),
        };
    }
  };

  const { title, description } = getStepHeader();

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === 'form' && renderFormStep()}
        {step === 'models' && renderModelsStep()}
        {step === 'complete' && renderCompleteStep()}
      </CardContent>

      <CardFooter className="flex justify-between pt-6 border-t">
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 'models') {
              // 返回表单步骤
              setStep('form');
            } else {
              onBack?.();
            }
          }}
          disabled={step === 'complete' ? false : !onBack && step === 'form'}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex gap-2">
          {onSkip && step === 'form' && (
            <Button variant="ghost" onClick={onSkip}>
              {t('common.skip')}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'form' && (
            <Button disabled>
              {t('common.next')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'models' && (
            <Button onClick={handleSaveModels} disabled={savingModels}>
              {savingModels ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  {t('setup.provider.save_models')}
                </>
              )}
            </Button>
          )}
          {step === 'complete' && (
            <Button onClick={onNext}>
              {t('common.next')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export default ProviderStep;
