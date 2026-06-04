import { BrandingPayload, ThemeTokens } from "@/core/theme/types";

const fallbackBranding: BrandingPayload = {
  key: "worksuite",
  displayName: "Work Suite",
  tagline: "",
  description: "",
  logoUrl: "",
  primaryColor: "#1f6f8b",
  themePrimary: "#e11d48",
  themeSecondary: "#f59e0b",
  publicSlug: "worksuite",
  legacySlugs: [],
  aliases: {
    ui: {
      monitorLabel: "Work Suite"
    },
    marketing: {},
    email: {}
  }
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(safe, 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255
  };
}

function rgba(hex: string, alpha: number) {
  const { red, green, blue } = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function normalizeBranding(payload?: Partial<BrandingPayload>): BrandingPayload {
  return {
    ...fallbackBranding,
    ...payload,
    primaryColor: payload?.primaryColor || fallbackBranding.primaryColor,
    themePrimary: payload?.themePrimary || fallbackBranding.themePrimary,
    themeSecondary: payload?.themeSecondary || fallbackBranding.themeSecondary
  };
}

export function buildThemeTokens(payload?: Partial<BrandingPayload>): ThemeTokens {
  const branding = normalizeBranding(payload);
  const primary = branding.themePrimary || branding.primaryColor;
  const secondary = branding.themeSecondary || "#0f172a";

  return {
    branding,
    colors: {
      primary,
      primarySoft: rgba(primary, 0.12),
      primaryGlow: rgba(primary, 0.26),
      secondary,
      background: "#f8fafc",
      backgroundAccent: rgba(primary, 0.06),
      surface: "#ffffff",
      surfaceRaised: "#ffffff",
      surfaceAlt: "#f8fbff",
      surfaceTint: rgba(primary, 0.05),
      text: "#0f172a",
      muted: "#5f6c80",
      border: rgba(primary, 0.1),
      shadow: rgba(primary, 0.14),
      success: "#149f6f",
      danger: "#d64545"
    }
  };
}
