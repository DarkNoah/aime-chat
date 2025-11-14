import i18n from '@/i18n';
import React, { createContext, ReactNode, useMemo, useState } from 'react';

export type HeaderContextValue = {
  title: string | ReactNode;
  titleAction: ReactNode | null;
  setTitle: (value: string | React.ReactNode) => void;
  setTitleAction: (value: ReactNode | null) => void;
};

export const HeaderContext = createContext<HeaderContextValue>({
  title: '',
  setTitle: () => {},
  titleAction: null,
  setTitleAction: () => {},
});

export function HeaderProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [title, setTitle] = useState<string | React.ReactNode>('');
  const [titleAction, setTitleAction] = useState<ReactNode | null>(null);
  const value = useMemo(
    () => ({ title, setTitle, titleAction, setTitleAction }),
    [title, setTitle, titleAction, setTitleAction],
  );

  return (
    <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>
  );
}
