import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { az } from "@/i18n/locales/az";
import { en } from "@/i18n/locales/en";

export const LANGUAGE_STORAGE_KEY = "dataclass-language";
export type AppLanguage = "az" | "en";

function readLanguage(): AppLanguage {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return value === "az" || value === "en" ? value : "az";
  } catch {
    return "az";
  }
}

export const initialLanguage = readLanguage();
document.documentElement.lang = initialLanguage;
void i18n.use(initReactI18next).init({
  initAsync: false,
  resources: { az: { translation: az }, en: { translation: en } },
  lng: initialLanguage,
  fallbackLng: "az",
  supportedLngs: ["az", "en"],
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (languages, _namespace, key) => {
    if (import.meta.env.DEV)
      console.warn(`[i18n] Missing key "${key}" for ${languages.join(",")}`);
  },
});

export async function changeLanguage(language: AppLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
  await i18n.changeLanguage(language);
}

export default i18n;
