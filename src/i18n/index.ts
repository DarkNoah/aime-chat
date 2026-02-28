import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enUs from './locales/en-us.json';
import zhCn from './locales/zh-cn.json';
import Cookies from 'js-cookie';
import { LanguageCode } from '@/types/languages';

// export const languages = ['en-US', 'zh-CN'] as const;
// export type Language = (typeof languages)[number];

const option = {
  fallbackLng: 'zh-cn',
  // debug: process.env.NODE_ENV !== 'production',
  debug: false,
  resources: {
    'en-US': {
      translation: enUs,
    },
    'zh-CN': {
      translation: zhCn,
    },
  },
  interpolation: {
    escapeValue: false, // not needed for react!!
  },
  react: {
    useSuspense: false, // 避免服务端渲染问题
  },
};
i18n.use(LanguageDetector).use(initReactI18next).init(option);

export const changeLanguage = async (language: LanguageCode) => {
  await i18n.changeLanguage(language);
  Cookies.set('language', language, { expires: 365 });
};

// 获取当前语言
export const getCurrentLanguage = (): LanguageCode => {
  return (i18n.language.toLowerCase() as LanguageCode) || 'en-us';
};

export default i18n;
