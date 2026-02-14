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
import toast from 'react-hot-toast';
import { RuntimeInfo } from '@/types/app';

function Runtime() {
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('runtime'));
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>(null);
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
    setRuntimeInfo({ ...runtimeInfo, [pkg]: { status: 'installing' } });
    try {
      await window.electron.app.installRuntime(pkg);
      getRuntimeInfo();
    } catch (err) {
      toast.error(`Failed to install ${pkg} runtime.`);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstallRuntime = async (pkg: string) => {
    setLoading(true);
    try {
      await window.electron.app.uninstallRuntime(pkg);
      getRuntimeInfo();
    } catch (err) {
      toast.error(`Failed to uninstall ${pkg} runtime.`);
    } finally {
      setLoading(false);
    }
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
      <Item variant="outline">
        <ItemContent className="min-w-0">
          <ItemTitle>
            PaddleOCR{' '}
            {runtimeInfo?.paddleOcr?.version && (
              <Badge>{runtimeInfo?.paddleOcr?.version}</Badge>
            )}
          </ItemTitle>
          {runtimeInfo?.paddleOcr?.path && (
            <ItemDescription>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  window.electron.app.openPath(runtimeInfo?.paddleOcr?.path)
                }
              >
                <IconFolder />
                <span className="truncate">{runtimeInfo?.paddleOcr?.path}</span>
              </Button>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          {runtimeInfo?.paddleOcr?.status === 'not_installed' && (
            <Button onClick={() => handleInstallRuntime('paddleOcr')}>
              Install
            </Button>
          )}
          {runtimeInfo?.paddleOcr?.status === 'installed' && (
            <Button
              onClick={() => handleUninstallRuntime('paddleOcr')}
              variant="destructive"
            >
              Uninstall
            </Button>
          )}
          {runtimeInfo?.paddleOcr?.status === 'installing' && (
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
            Bun{' '}
            {runtimeInfo?.bun?.version && (
              <Badge>{runtimeInfo?.bun?.version}</Badge>
            )}
          </ItemTitle>
          {runtimeInfo?.bun?.path && (
            <ItemDescription>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  window.electron.app.openPath(runtimeInfo?.bun?.path)
                }
              >
                <IconFolder />
                <span className="truncate">{runtimeInfo?.bun?.path}</span>
              </Button>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          {runtimeInfo?.bun?.status === 'not_installed' && (
            <Button onClick={() => handleInstallRuntime('bun')}>Install</Button>
          )}
          {runtimeInfo?.bun?.status === 'installed' && (
            <Button
              onClick={() => handleUninstallRuntime('bun')}
              variant="destructive"
            >
              Uninstall
            </Button>
          )}
          {runtimeInfo?.bun?.status === 'installing' && (
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
            QwenAudio{' '}
            {runtimeInfo?.qwenAudio?.version && (
              <Badge>{runtimeInfo?.qwenAudio?.version}</Badge>
            )}
          </ItemTitle>
          {runtimeInfo?.qwenAudio?.path && (
            <ItemDescription>
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  window.electron.app.openPath(runtimeInfo?.qwenAudio?.path)
                }
              >
                <IconFolder />
                <span className="truncate">{runtimeInfo?.qwenAudio?.path}</span>
              </Button>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          {runtimeInfo?.qwenAudio?.status === 'not_installed' && (
            <Button onClick={() => handleInstallRuntime('qwenAudio')}>
              Install
            </Button>
          )}
          {runtimeInfo?.qwenAudio?.status === 'installed' && (
            <Button
              onClick={() => handleUninstallRuntime('qwenAudio')}
              variant="destructive"
            >
              Uninstall
            </Button>
          )}
          {runtimeInfo?.qwenAudio?.status === 'installing' && (
            <Button disabled>
              <Spinner />
              Installing...
            </Button>
          )}
        </ItemActions>
      </Item>
    </div>
  );
}
export default Runtime;
