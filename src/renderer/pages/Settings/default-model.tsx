import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/renderer/components/ui/field';
import { Separator } from '@/renderer/components/ui/separator';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import logo from '@/../assets/icon.png';
import { useEffect } from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@/renderer/components/ui/input-group';
import { ArrowUpIcon, Brain, Eye, ScanEye, Zap } from 'lucide-react';
import { Input } from '@/renderer/components/ui/input';
import { IconFolder } from '@tabler/icons-react';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { Select } from '@/renderer/components/ui/select';
import { ChatModelSelect } from '@/renderer/components/chat-ui/chat-model-select';
import { AppInfo } from '@/types/app';
import { ModelType } from '@/types/provider';

export default function DefaultModel() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();

  useEffect(() => {
    setTitle(t('settings.default_model'));
  }, [setTitle, t]);

  const onChangeDefaultModel = async (
    model: string,
    type: keyof AppInfo['defaultModel'],
  ) => {
    await window.electron.app.saveSettings({
      id: 'defaultModel',
      value: {
        ...appInfo?.defaultModel,
        [type]: model,
      },
    });
    await getAppInfo();
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>
            <Zap className="w-5 h-5" />
            {t('settings.default_fast_model')}
          </ItemTitle>
          <ItemDescription></ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChatModelSelect
            clearable
            className="w-[200px] border"
            value={appInfo?.defaultModel?.fastModel}
            onChange={(model) => {
              onChangeDefaultModel(model, 'fastModel');
            }}
          />
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>
            <Brain className="w-5 h-5" />
            {t('settings.default_model')}
          </ItemTitle>
          <ItemDescription></ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChatModelSelect
            clearable
            className="w-[200px] border"
            value={appInfo?.defaultModel?.model}
            onChange={(model) => {
              onChangeDefaultModel(model, 'model');
            }}
          />
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>
            <Eye className="w-5 h-5" />
            {t('settings.vision_model')}
          </ItemTitle>
          <ItemDescription></ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChatModelSelect
            clearable
            className="w-[200px] border"
            value={appInfo?.defaultModel?.visionModel}
            onChange={(model) => {
              onChangeDefaultModel(model, 'visionModel');
            }}
          />
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>
            <ScanEye className="w-5 h-5" />
            {t('settings.default_ocr')}
          </ItemTitle>
          <ItemDescription></ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChatModelSelect
            clearable
            type={ModelType.OCR}
            className="w-[200px] border"
            value={appInfo?.defaultModel?.ocrModel}
            onChange={(model) => {
              onChangeDefaultModel(model, 'ocrModel');
            }}
          />
        </ItemActions>
      </Item>
    </div>
  );
}
