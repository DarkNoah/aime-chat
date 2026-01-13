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
import { SetupStepProps } from './index';
import { useForm } from 'react-hook-form';
import { CreateProvider } from '@/types/provider';
import { ArrowLeft, ArrowRight, Plus, Check, SkipForward } from 'lucide-react';
import ProviderIcon from '@/renderer/components/provider-icon';
import { ModelSelectorLogo } from '@/renderer/components/ai-elements/model-selector';
import modelsData from '@/../assets/models.json';
import toast from 'react-hot-toast';
import { Spinner } from '@/renderer/components/ui/spinner';

function ProviderStep({ onNext, onBack, onSkip }: SetupStepProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [providerAdded, setProviderAdded] = useState(false);

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

  const handleSubmit = async (data: CreateProvider) => {
    setSubmitting(true);
    try {
      await window.electron.providers.create(data);
      setProviderAdded(true);
      toast.success(t('setup.provider.added_success'));
    } catch (err: any) {
      toast.error(err.message || t('setup.provider.added_error'));
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold">
          {t('setup.provider.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t('setup.provider.description')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {providerAdded ? (
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
            </div>
            <Button variant="outline" onClick={() => setProviderAdded(false)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('setup.provider.add_another')}
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
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
                            <SelectLabel>
                              {t('setup.provider.popular')}
                            </SelectLabel>
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
                              .filter(
                                (m: any) => !popularProviders.includes(m.id),
                              )
                              .sort((x: any, y: any) =>
                                x.name.localeCompare(y.name),
                              )
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
                      <Input type="password" placeholder="sk-..." {...field} />
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
        )}
      </CardContent>

      <CardFooter className="flex justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} disabled={!onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex gap-2">
          {onSkip && !providerAdded && (
            <Button variant="ghost" onClick={onSkip}>
              {t('common.skip')}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button onClick={onNext} disabled={!providerAdded}>
            {t('common.next')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ProviderStep;
