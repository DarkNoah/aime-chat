import { Field, FieldGroup, FieldLabel } from '@/renderer/components/ui/field';
import { Separator } from '@/renderer/components/ui/separator';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import logo from '@/../assets/icon.png';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';

export default function About() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  setTitle(t('settings.about'));
  return (
    <div className="flex flex-col p-4">
      <div className="p-4 flex flex-row gap-3">
        <img src={logo} alt="logo" width={100} height={100}></img>
        <div className="flex flex-col gap-2">
          <span className="text-2xl font-bold flex flex-row items-center gap-2">
            {appInfo.name}
            {appInfo?.isPackaged === false && (
              <Badge
                variant="outline"
                className="text-muted-foreground  text-xs"
              >
                Dev
              </Badge>
            )}
          </span>
          <span className="text-sm text-gray-500">{appInfo.version}</span>
          <div className="flex flex-row gap-2">
            <Button size="sm">新版本</Button>
          </div>
        </div>
      </div>

      <Separator></Separator>
      <FieldGroup className="p-4">
        <Field>
          <FieldLabel htmlFor="checkout-7j9-card-name-43j">
            {t('dataPath')}
          </FieldLabel>
          {appInfo?.dataPath}
        </Field>
        <Field>
          <FieldLabel htmlFor="checkout-7j9-card-name-43j">
            {t('appData')}
          </FieldLabel>
          {appInfo?.appData}
        </Field>
        <Field>
          <FieldLabel htmlFor="checkout-7j9-card-name-43j">
            {t('appPath')}
          </FieldLabel>
          {appInfo?.appPath}
        </Field>
      </FieldGroup>
    </div>
  );
}
