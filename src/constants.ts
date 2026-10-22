import type { Language } from './types/language';

export const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: "en-US", name: "English (US)", label: "EN", flag: "US" },
  { code: "es-ES", name: "Español", label: "ES", flag: "ES" },
  { code: "fr-FR", name: "Francés", label: "FR", flag: "FR" },
  { code: "ar-SA", name: "العربية", label: "ع", flag: "SA" },
];