import "i18next";
import type { az } from "@/i18n/locales/az";
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: typeof az;
  }
}
