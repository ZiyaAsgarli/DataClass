import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type BrandVariant = "full" | "mark";
type BrandTheme = "light" | "dark";

const brandAssets = {
  full: {
    light: "/brand/dataclass-logo-light.png",
    dark: "/brand/dataclass-logo-dark.png",
    width: 1200,
    height: 269,
  },
  mark: {
    light: "/brand/dataclass-mark-light.png",
    dark: "/brand/dataclass-mark-dark.png",
    width: 512,
    height: 363,
  },
} as const;

function readBrandTheme(): BrandTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function useBrandTheme() {
  const [theme, setTheme] = useState<BrandTheme>(readBrandTheme);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function Brand({
  variant = "full",
  decorative = false,
  className,
}: {
  variant?: BrandVariant;
  decorative?: boolean;
  className?: string;
}) {
  const theme = useBrandTheme();
  const asset = brandAssets[variant];

  return (
    <img
      src={asset[theme]}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : "DataClass"}
      decoding="async"
      draggable={false}
      className={cn(
        "block h-auto shrink-0 object-contain",
        variant === "full" ? "w-40" : "w-10",
        className,
      )}
    />
  );
}
