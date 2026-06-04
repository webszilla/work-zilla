import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { ThemeTokens } from "@/core/theme/types";
import { buildThemeTokens } from "@/core/theme/theme";
import { useBranding } from "@/core/theme/useBranding";
import { useAuth } from "@/core/auth/AuthContext";

const ThemeContext = createContext<ThemeTokens>(buildThemeTokens());

export function ThemeProvider({ children }: PropsWithChildren) {
  const { branding } = useBranding();
  const { session } = useAuth();
  const value = useMemo(() => {
    if (session?.authenticated) {
      return buildThemeTokens({
        ...branding,
        displayName: session.profile?.organization?.name || branding.displayName,
        themePrimary: session.theme_primary || branding.themePrimary,
        themeSecondary: session.theme_secondary || branding.themeSecondary
      });
    }
    return buildThemeTokens(branding);
  }, [branding, session]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeTokens() {
  return useContext(ThemeContext);
}
