export const LanguageCodes = ['en-us', 'zh-cn'] as const;
export type LanguageCode = (typeof LanguageCodes)[number];

export const Languages: Record<LanguageCode, string> = {
  'en-us': 'English',
  'zh-cn': '中文',
};
