const locales = { az: "az-AZ", en: "en-GB" } as const;
export function appLocale(language: string) {
  return locales[language === "en" ? "en" : "az"];
}
export function formatDate(
  value: string | null | undefined,
  language: string,
  fallback: string,
) {
  if (!value) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat(appLocale(language), {
    dateStyle: "medium",
  }).format(date);
}
export function formatDateTime(
  value: string | null | undefined,
  language: string,
  fallback: string,
) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(appLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function formatFileSize(value: number, language: string) {
  const amount =
    value < 1024 ? value : value < 1024 ** 2 ? value / 1024 : value / 1024 ** 2;
  const unit = value < 1024 ? "B" : value < 1024 ** 2 ? "KiB" : "MiB";
  return `${new Intl.NumberFormat(appLocale(language), { maximumFractionDigits: value >= 100 * 1024 ** 2 ? 0 : 1 }).format(amount)} ${unit}`;
}

const resourceValidationKeys: Record<string, string> = {
  "Choose a file with a safe file name.": "validation.safeFile",
  "This file type is not supported.": "validation.unsupported",
  "Empty files cannot be uploaded.": "validation.empty",
  "Files must be 500 MiB or smaller.": "validation.tooLarge",
};

export function resourceValidationKey(message: string) {
  return resourceValidationKeys[message] ?? "validation.uploadFailed";
}
