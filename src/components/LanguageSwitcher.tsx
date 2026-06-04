import { useTranslation } from 'react-i18next';

/**
 * Language switcher — toggles between Arabic and English.
 * Persists selection in localStorage under 'medipulse-lang'.
 * Also updates document dir (rtl/ltr) via the i18n listener in src/i18n/index.ts.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const toggle = () => {
    i18n.changeLanguage(isArabic ? 'en' : 'ar');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors font-medium"
      title={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
      aria-label="Switch language"
    >
      {isArabic ? (
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">🇬🇧</span>
          <span>EN</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">🇸🇦</span>
          <span>عربي</span>
        </span>
      )}
    </button>
  );
}
