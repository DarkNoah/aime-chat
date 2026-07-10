import { ReactNode } from 'react';
import { useGlobal } from '@/renderer/hooks/use-global';

export function useIsCompactWindow() {
  const { appInfo } = useGlobal();
  return appInfo?.windowMode?.current === 'compact';
}

export function ChatPreviewVisibility({
  children,
  visible = true,
}: {
  children: ReactNode;
  visible?: boolean;
}) {
  const isCompactWindow = useIsCompactWindow();
  return isCompactWindow || !visible ? null : children;
}
