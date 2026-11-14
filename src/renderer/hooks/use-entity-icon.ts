import { useEffect, useState } from 'react';

export type EntityIconKind = 'agents' | 'skills';

// 自定义图标：assets/icons/<kind>/<name>.jpg，通过 IPC 读取为 data URI
// 模块级缓存（null 表示没有对应文件）并合并并发请求；新增图片后需刷新窗口
const iconCache = new Map<string, string | null>();
const iconPending = new Map<string, Promise<string | null>>();

const cacheKey = (kind: EntityIconKind, name: string) => `${kind}/${name}`;

export function loadEntityIcon(
  kind: EntityIconKind,
  name: string,
): Promise<string | null> {
  const key = cacheKey(kind, name);
  if (iconCache.has(key)) {
    return Promise.resolve(iconCache.get(key)!);
  }
  let task = iconPending.get(key);
  if (!task) {
    task = window.electron.app
      .getEntityIcon(kind, name)
      .catch(() => null)
      .then((src) => {
        iconCache.set(key, src);
        return src;
      })
      .finally(() => {
        iconPending.delete(key);
      });
    iconPending.set(key, task);
  }
  return task;
}

// skill id 形如 skill:<name>、skill:local:<name>、skill:<marketplace>:<name>，
// 冒号不能出现在 Windows 文件名中，因此取最后一段作为文件名
export function getSkillIconName(id: string | undefined) {
  if (!id?.startsWith('skill:')) return undefined;
  return id.slice(id.lastIndexOf(':') + 1) || undefined;
}

export function useEntityIcon(kind: EntityIconKind, name: string | undefined) {
  const [src, setSrc] = useState<string | null>(() =>
    name ? (iconCache.get(cacheKey(kind, name)) ?? null) : null,
  );

  useEffect(() => {
    if (!name) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    setSrc(iconCache.get(cacheKey(kind, name)) ?? null);
    loadEntityIcon(kind, name).then((value) => {
      if (!cancelled) setSrc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, name]);

  return src;
}
