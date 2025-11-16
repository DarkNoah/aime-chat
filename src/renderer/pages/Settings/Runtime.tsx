import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/renderer/components/ui/native-select';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { IconFolder, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function Runtime() {
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('runtime'));
  const [runtimeInfo, setRuntimeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const getRuntimeInfo = async () => {
    const data = await window.electron.app.getRuntimeInfo();
    console.log(data);
    setRuntimeInfo(data);
  };
  useEffect(() => {
    getRuntimeInfo();
  }, []);
  const handleInstallRuntime = async (pkg: string) => {
    setLoading(true);
    setRuntimeInfo({ ...runtimeInfo, uv: { status: 'installing' } });
    await window.electron.app.installRuntime('uv');
    getRuntimeInfo();
    setLoading(false);
  };

  const handleUninstallRuntime = async (pkg: string) => {
    setLoading(true);
    await window.electron.app.uninstallRuntime('uv');
    getRuntimeInfo();
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <Item variant="outline">
        <ItemContent className="min-w-0">
          <ItemTitle>
            UV{' '}
            {runtimeInfo?.uv?.version && (
              <Badge>{runtimeInfo?.uv?.version}</Badge>
            )}
          </ItemTitle>
          {runtimeInfo?.uv?.path && (
            <ItemDescription>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  window.electron.app.openPath(runtimeInfo?.uv?.path)
                }
              >
                <IconFolder />
                <span className="truncate">{runtimeInfo?.uv?.path}</span>
              </Button>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          {runtimeInfo?.uv?.status === 'not_installed' && (
            <Button onClick={() => handleInstallRuntime('uv')}>Install</Button>
          )}
          {runtimeInfo?.uv?.status === 'installed' && (
            <Button
              onClick={() => handleUninstallRuntime('uv')}
              variant="destructive"
            >
              Uninstall
            </Button>
          )}
          {runtimeInfo?.uv?.status === 'installing' && (
            <Button disabled>
              <Spinner />
              Installing...
            </Button>
          )}
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent className="min-w-0">
          <ItemTitle>
            Node.js{' '}
            {runtimeInfo?.node?.version && (
              <Badge>{runtimeInfo?.node?.version}</Badge>
            )}
          </ItemTitle>
          {runtimeInfo?.node?.path && (
            <ItemDescription>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  window.electron.app.openPath(runtimeInfo?.node?.path)
                }
              >
                <IconFolder />
                <span className="truncate">{runtimeInfo?.node?.path}</span>
              </Button>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions></ItemActions>
      </Item>
    </div>
  );
}
export default Runtime;
