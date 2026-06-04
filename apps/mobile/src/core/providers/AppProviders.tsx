import { PropsWithChildren } from "react";

import { AuthProvider } from "@/core/auth/AuthContext";
import { BrandingProvider } from "@/core/theme/useBranding";
import { ThemeProvider } from "@/core/theme/ThemeContext";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
