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
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Switch } from '@/renderer/components/ui/switch';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { Button } from '@/renderer/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/renderer/components/ui/alert';
import { ChatAgentSelector } from '@/renderer/components/chat-ui/chat-agent-selector';
import { PromptInputButton } from '@/renderer/components/ai-elements/prompt-input';

export default function General() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  setTitle(t('settings.general'));

  const [proxy, setProxy] = useState<AppProxy>(
    appInfo?.proxy || { mode: 'noproxy' },
  );
  const [apiServerPort, setApiServerPort] = useState<number>(
    appInfo?.apiServer?.port || 0,
  );
  const [acpPort, setAcpPort] = useState<number>(appInfo?.acp?.port || 0);

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

  const onChangeApiServerPort = async (port: number) => {
    await window.electron.app.setApiServerPort(port);
    await getAppInfo();
  };

  const onChangeApiServerEnable = async (enabled: boolean) => {
    await window.electron.app.toggleApiServerEnable(enabled);
    await getAppInfo();
  };

  const onChangeACPEnable = async (enabled: boolean) => {
    await window.electron.app.toggleACPEnable(enabled);
    await getAppInfo();
  };

  const onChangeACPPort = async (port: number) => {
    await window.electron.app.setACPPort(port);
    await getAppInfo();
  };
  const onChangeDefaultAgent = async (agent: string) => {
    await window.electron.app.saveSettings({
      id: 'defaultAgent',
      value: agent,
    });
    await getAppInfo();
  };
  const onChangeDefaultThink = async (think: string) => {
    await window.electron.app.saveSettings({
      id: 'defaultThink',
      value: think,
    });
    await getAppInfo();
  };

  const onChangeKeepAwakeWithDisplaySleep = async (enabled: boolean) => {
    await window.electron.app.saveSettings({
      id: 'keepAwakeWithDisplaySleep',
      value: enabled,
    });
    await getAppInfo();
  };

  return (
    <FieldGroup className="p-4 overflow-y-auto">
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
        <FieldLabel>{t('settings.default_agent')}</FieldLabel>
        <div className="w-full">
          <ChatAgentSelector
            className="w-[200px]"
            mode="single"
            value={appInfo?.defaultAgent}
            onChange={(value) => {
              onChangeDefaultAgent(value);
            }}
            onSelectedAgent={() => {}}
          >
            <Button
              variant="outline"
              size="sm"
              className="w-[200px] justify-start"
            >
              @{appInfo?.defaultAgent}
            </Button>
          </ChatAgentSelector>
        </div>
      </Field>
      <Field>
        <FieldLabel>{t('settings.default_think')}</FieldLabel>
        <div className="max-w-[200px]">
          <Select
            value={appInfo?.defaultThink}
            onValueChange={onChangeDefaultThink}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">{t('settings.think_none')}</SelectItem>
                <SelectItem value="low">{t('settings.think_low')}</SelectItem>
                <SelectItem value="medium">
                  {t('settings.think_medium')}
                </SelectItem>
                <SelectItem value="high">{t('settings.think_high')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
      <Field>
        <FieldLabel>防止系统休眠</FieldLabel>
        <div className="flex flex-row items-center gap-3">
          <Switch
            checked={!!appInfo?.keepAwakeWithDisplaySleep}
            onCheckedChange={onChangeKeepAwakeWithDisplaySleep}
          />
          <Label>允许屏幕关闭，但阻止系统休眠</Label>
        </div>
      </Field>
      <Field>
        <FieldLabel>ACP Studio</FieldLabel>
        <div className="flex flex-row items-center gap-3">
          <Switch
            checked={!!appInfo?.acp?.enabled}
            onCheckedChange={onChangeACPEnable}
          />
          <Label>Enable ACP HTTP server</Label>
          <Input
            type="number"
            className="w-[100px]"
            min={1}
            max={65535}
            placeholder="Port: 1-65535"
            disabled={appInfo?.acp?.status === 'running'}
            value={acpPort || appInfo?.acp?.port || 0}
            onChange={(e) => {
              setAcpPort(parseInt(e.target.value, 10));
            }}
            onBlur={() => {
              onChangeACPPort(acpPort || appInfo?.acp?.port || 0);
            }}
          />
        </div>
        <Alert>
          <AlertTitle>ACP status</AlertTitle>
          <AlertDescription>
            {appInfo?.acp?.status} · {appInfo?.acp?.transport}
            {appInfo?.acp?.url ? ` · ${appInfo.acp.url}` : ''}
          </AlertDescription>
        </Alert>
      </Field>
      <Field>
        <FieldLabel>{t('settings.apiServer')}</FieldLabel>
        <div className="flex flex-row items-center gap-2">
          <Label>{t('settings.apiServerPort')}</Label>
          <Input
            type="number"
            className="w-[100px]"
            min={1}
            max={65535}
            placeholder="Port: 1-65535"
            disabled={appInfo?.apiServer?.enabled}
            value={apiServerPort}
            onChange={(e) => {
              setApiServerPort(parseInt(e.target.value, 10));
            }}
            onBlur={() => {
              onChangeApiServerPort(apiServerPort);
            }}
          />

          {appInfo?.apiServer?.enabled && (
            <Button
              variant="outline"
              onClick={() => onChangeApiServerEnable(false)}
            >
              <IconPlayerStop></IconPlayerStop>
              {t('settings.apiServerStop')}
            </Button>
          )}
          {!appInfo?.apiServer?.enabled && (
            <Button
              variant="outline"
              onClick={() => onChangeApiServerEnable(true)}
            >
              <IconPlayerPlay></IconPlayerPlay>
              {t('common.apiServerStart')}
            </Button>
          )}
        </div>
        {appInfo?.apiServer?.status === 'running' && (
          <Alert>
            <AlertTitle>{t('settings.apiServerTRunningips')}</AlertTitle>
            <AlertDescription>
              http://localhost:{appInfo?.apiServer?.port}
            </AlertDescription>
          </Alert>
        )}
      </Field>
    </FieldGroup>
  );
}
