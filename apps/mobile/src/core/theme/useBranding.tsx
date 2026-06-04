import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";
import { DEFAULT_PRODUCT_KEY } from "@/core/config/env";
import { BrandingPayload } from "@/core/theme/types";
import { normalizeBranding } from "@/core/theme/theme";

type BrandingContextValue = {
  branding: BrandingPayload;
  loading: boolean;
  error: string;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: normalizeBranding(),
  loading: true,
  error: ""
});

export function BrandingProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<BrandingContextValue>({
    branding: normalizeBranding(),
    loading: true,
    error: ""
  });

  useEffect(() => {
    let active = true;

    apiGet<BrandingPayload>(`/api/public/branding/?product=${encodeURIComponent(DEFAULT_PRODUCT_KEY)}`)
      .then((branding) => {
        if (!active) {
          return;
        }
        setState({
          branding: normalizeBranding(branding),
          loading: false,
          error: ""
        });
      })
      .catch((error: Error) => {
        if (!active) {
          return;
        }
        setState({
          branding: normalizeBranding(),
          loading: false,
          error: error.message || "Unable to load branding"
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return <BrandingContext.Provider value={state}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
