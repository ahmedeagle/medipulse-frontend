import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

// Arabic is the product default. Respect an explicit user choice stored in localStorage.
const saved = localStorage.getItem('bnoov-lang');
const initialLng: string = (saved === 'en' || saved === 'ar') ? saved : 'ar';

i18n
  .use(initReactI18next)
  .init({
    lng: initialLng,
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'ar',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('bnoov-lang', lng);
  document.documentElement.dir  = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

// Apply direction immediately before React mounts
document.documentElement.dir  = initialLng === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = initialLng;

export default i18n;
export const isRTL = () => i18n.language === 'ar';
