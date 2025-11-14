import i18n, { changeLanguage } from '@/i18n';
import LanguageToggle from '@/renderer/components/language-toggle';
import { Field, FieldGroup, FieldLabel } from '@/renderer/components/ui/field';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/renderer/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { AppProxy } from '@/types/app';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTheme } from 'next-themes';

export default function General() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  setTitle(t('settings.general'));

  const [proxy, setProxy] = useState<AppProxy>(
    appInfo?.proxy || { mode: 'noproxy' },
  );

  const onChangeTheme = async (value: string) => {
    setTheme(value);
    await window.electron.app.setTheme(value);
    await getAppInfo();
  };

  const onChangeProxy = async (data: AppProxy) => {
    setProxy(data);
    await window.electron.app.setProxy(data);
    await getAppInfo();
  };
  return (
    <FieldGroup className="p-4">
      <Field className="max-w-[200px]">
        <FieldLabel>{t('settings.theme')}</FieldLabel>
        <Select value={appInfo?.theme} onValueChange={onChangeTheme}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="system">
                {t('settings.theme_system')}
              </SelectItem>
              <SelectItem value="light">{t('settings.theme_light')}</SelectItem>
              <SelectItem value="dark">{t('settings.theme_dark')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>{t('settings.language')}</FieldLabel>
        <div className="w-full">
          <LanguageToggle className="w-[200px]"></LanguageToggle>
        </div>
      </Field>
      <Field>
        <FieldLabel>{t('settings.proxy')}</FieldLabel>
        <RadioGroup
          defaultValue="system"
          value={appInfo?.proxy?.mode}
          orientation="horizontal"
          className="flex flex-row"
          onValueChange={(value) =>
            onChangeProxy({ mode: value as 'system' | 'custom' | 'noproxy' })
          }
        >
          <div className="flex items-center gap-3">
            <RadioGroupItem value="system" id="r1" />
            <Label htmlFor="r1">{t('settings.use_system_proxy')}</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="custom" id="r2" />
            <Label htmlFor="r2">{t('settings.proxy_customize')}</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="noproxy" id="r3" />
            <Label htmlFor="r3">{t('settings.proxy_not_using')}</Label>
          </div>
        </RadioGroup>
      </Field>

      {appInfo?.proxy?.mode === 'custom' && (
        <div className="flex flex-row items-center gap-2">
          <Field className="max-w-[200px]">
            {/* <FieldLabel>{t('settings.proxy.host')}</FieldLabel> */}
            <Input
              value={proxy?.host}
              placeholder="IP Address: 127.0.0.1"
              onChange={(e) => setProxy({ ...proxy, host: e.target.value })}
              onBlur={() => {
                onChangeProxy({
                  mode: 'custom',
                  host: proxy?.host,
                  port: proxy?.port,
                });
              }}
            />
          </Field>
          <span>:</span>
          <Field className="max-w-[150px]">
            {/* <FieldLabel>{t('settings.proxy_port')}</FieldLabel> */}
            <Input
              type="number"
              min={1}
              max={65535}
              placeholder="Port: 1-65535"
              value={proxy?.port}
              onChange={(e) =>
                setProxy({ ...proxy, port: parseInt(e.target.value, 10) })
              }
              onBlur={() => {
                onChangeProxy({
                  mode: 'custom',
                  host: proxy?.host,
                  port: proxy?.port,
                });
              }}
            />
          </Field>
        </div>
      )}
    </FieldGroup>
  );
}
