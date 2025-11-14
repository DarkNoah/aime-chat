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
import { ArrowUpIcon } from 'lucide-react';
import { Input } from '@/renderer/components/ui/input';
import { IconFolder } from '@tabler/icons-react';

export default function LocalModel() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  useEffect(() => {
    setTitle(t('settings.local_model'));
  }, [setTitle, t]);

  const onSelectPath = async () => {
    const res = await window.electron.app.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (res.canceled) return;
    const { filePaths } = res;
    if (filePaths.length !== 1) return;
    const path = filePaths[0];
    await window.electron.app.saveSettings({
      id: 'modelPath',
      value: path,
    });
    await getAppInfo();
  };

  return (
    <FieldGroup className="p-4">
      <Field>
        <FieldLabel>{t('settings.model_location')}</FieldLabel>
        <FieldContent className="flex flex-row items-center gap-2">
          <Button
            variant="link"
            className="flex-1 truncate justify-start bg-secondary"
            onClick={() => {
              window.electron.app.openPath(appInfo?.modelPath);
            }}
          >
            <span className="truncate">{appInfo?.modelPath}</span>
          </Button>
          <Button onClick={onSelectPath}>更改目录</Button>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}
