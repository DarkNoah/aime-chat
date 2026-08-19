import React, { ComponentProps } from 'react';

import ollamaIcon from '@/../assets/model-logos/ollama.png';
import tongyiIcon from '@/../assets/model-logos/tongyi.png';
import anthropicIcon from '@/../assets/model-logos/anthropic.png';
import zhipuIcon from '@/../assets/model-logos/zhipu.png';
import openaiIcon from '@/../assets/model-logos/openai.png';
import groqIcon from '@/../assets/model-logos/groq.png';
import openrouterIcon from '@/../assets/model-logos/openrouter.png';
import siliconflowIcon from '@/../assets/model-logos/siliconflow.png';
import googleIcon from '@/../assets/model-logos/google.png';
import deepseekIcon from '@/../assets/model-logos/deepseek.png';
import togetheraiIcon from '@/../assets/model-logos/togetherai.png';
import baiduIcon from '@/../assets/model-logos/baidu.png';
import lmstudioIcon from '@/../assets/model-logos/lmstudio.png';
import azureOpenaiIcon from '@/../assets/model-logos/azure_openai.png';
import volcanoEngineIcon from '@/../assets/model-logos/volcanoengine.png';
import minimaxIcon from '@/../assets/model-logos/minimax.png';
import replicateIcon from '@/../assets/model-logos/replicate.png';
import elevenlabsIcon from '@/../assets/model-logos/elevenlabs.png';
import moonshotIcon from '@/../assets/model-logos/moonshot.png';
import bigmodelIcon from '@/../assets/model-logos/bigmodel.png';
import modelscopeIcon from '@/../assets/model-logos/modelscope.png';
import { cn } from '@/renderer/lib/utils';

interface ProviderIconProps extends ComponentProps<'div'> {
  provider: string;
  size?: number | string | null;
  className?: string | null;
}
const logos = {
  tongyi: tongyiIcon,
  ollama: ollamaIcon,
  anthropic: anthropicIcon,
  baidu: baiduIcon,
  zhipuai: zhipuIcon,
  openai: openaiIcon,
  'openai-responses': openaiIcon,
  groq: groqIcon,
  openrouter: openrouterIcon,
  siliconflow: siliconflowIcon,
  google: googleIcon,
  deepseek: deepseekIcon,
  togetherai: togetheraiIcon,
  lmstudio: lmstudioIcon,
  azure_openai: azureOpenaiIcon,
  volcanoengine: volcanoEngineIcon,
  minimax: minimaxIcon,
  replicate: replicateIcon,
  elevenlabs: elevenlabsIcon,
  moonshot: moonshotIcon,
  bigmodel: bigmodelIcon,
  modelscope: modelscopeIcon,
};

// ---- 本地 svg logo：通过 IPC 从主进程读取 assets/model-logos/<provider>.svg ----
// 前端模块级缓存（provider -> data URI，null 表示无本地文件），并合并并发请求
// （同时供 model-selector.tsx 的 ModelSelectorLogo 复用）
const localLogoCache = new Map<string, string | null>();
const localLogoPending = new Map<string, Promise<string | null>>();

export function getProviderLogoDataUri(
  provider: string,
): Promise<string | null> {
  if (localLogoCache.has(provider)) {
    return Promise.resolve(localLogoCache.get(provider)!);
  }
  let task = localLogoPending.get(provider);
  if (!task) {
    task = window.electron.app
      .getProviderLogo(provider)
      .then((svg: string | null) => {
        const dataUri = svg
          ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
          : null;
        localLogoCache.set(provider, dataUri);
        return dataUri;
      })
      .catch(() => {
        localLogoCache.set(provider, null);
        return null;
      })
      .finally(() => {
        localLogoPending.delete(provider);
      });
    localLogoPending.set(provider, task);
  }
  return task;
}

// eslint-disable-next-line react/function-component-definition
const ProviderIcon: React.FC<ProviderIconProps> = (
  props: ProviderIconProps,
) => {
  const { provider, size = 24, className } = props;
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [localLogo, setLocalLogo] = React.useState<string | null>(() =>
    logos[provider] ? null : (localLogoCache.get(provider) ?? null),
  );

  const hasStaticLogo = Boolean(logos[provider]);

  React.useEffect(() => {
    setLoadFailed(false);
  }, [provider]);

  React.useEffect(() => {
    if (hasStaticLogo) {
      setLocalLogo(null);
      return undefined;
    }
    let cancelled = false;
    // 先同步回填缓存（provider 切换时避免残留上一个 logo）
    setLocalLogo(localLogoCache.get(provider) ?? null);
    getProviderLogoDataUri(provider).then((logo) => {
      if (!cancelled) {
        setLocalLogo(logo);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider, hasStaticLogo]);

  if (loadFailed) {
    return null;
  }

  const logoSrc =
    logos[provider] ??
    localLogo ??
    `https://models.dev/logos/${provider}.svg`;

  return (
    <div>
      <img
        src={logoSrc}
        alt={`${provider} logo`}
        className={cn(
          className,
          `h-full ${logos[provider] ? '' : 'dark:invert'}`,
        )}
        style={{ width: size, minWidth: size, height: size, objectFit: 'contain' }}
        onError={() => setLoadFailed(true)}
      />
    </div>
  );
};

export default ProviderIcon;
