import { en } from './en';
import { sv } from './sv';

export type Language = 'en' | 'sv';

export const translations = {
  en,
  sv,
} as const;

export type TranslationKey = keyof typeof en;
