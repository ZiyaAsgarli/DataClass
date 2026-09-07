const locales = { az: "az-AZ", en: "en-GB" } as const;
const azerbaijaniMonths = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avqust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
] as const;

type DateInput = string | Date | null | undefined;

export function appLocale(language: string) {
  return locales[language === "en" ? "en" : "az"];
}

function resolveDate(value: DateInput) {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAzerbaijaniDate(date: Date) {
  return `${date.getDate()} ${azerbaijaniMonths[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDate(
  value: DateInput,
  language: string,
  fallback: string,
) {
  const date = resolveDate(value);
  if (!date) return fallback;
  if (language !== "en") return formatAzerbaijaniDate(date);
  return new Intl.DateTimeFormat(appLocale(language), {
    dateStyle: "medium",
  }).format(date);
}
export function formatDateTime(
  value: DateInput,
  language: string,
  fallback: string,
) {
  const date = resolveDate(value);
  if (!date) return fallback;
  if (language !== "en") {
    const time = new Intl.DateTimeFormat(appLocale(language), {
      timeStyle: "short",
    }).format(date);
    return `${formatAzerbaijaniDate(date)} ${time}`;
  }
  return new Intl.DateTimeFormat(appLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
