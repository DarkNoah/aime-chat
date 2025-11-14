'use client';

import { useEffect, useState, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { changeLanguage } from '@/i18n';
import Cookies from 'js-cookie';

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // 在客户端初始化时，从 Cookie 中读取语言设置
    const savedLanguage = Cookies.get('language');
    if (savedLanguage && i18n.language !== savedLanguage) {
      changeLanguage(savedLanguage)
        .then(() => {
          setIsInitialized(true);
          return null;
        })
        .catch((err) => {});
    } else {
      setIsInitialized(true);
    }
  }, []);

  // 等待初始化完成
  if (!isInitialized) {
    return null; // 或者返回一个加载状态
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
