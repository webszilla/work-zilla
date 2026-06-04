import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";
import { BrandingPayload } from "@/core/theme/types";
import { normalizeBranding } from "@/core/theme/theme";

type BrandingMap = Record<string, BrandingPayload>;

export function useProductBrandingMap(productSlugs: string[]) {
  const [state, setState] = useState<{ items: BrandingMap; loading: boolean }>({
    items: {},
    loading: productSlugs.length > 0
  });

  useEffect(() => {
    const uniqueSlugs = Array.from(new Set(productSlugs.filter(Boolean)));
    if (!uniqueSlugs.length) {
      setState({ items: {}, loading: false });
      return;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true }));

    Promise.all(
      uniqueSlugs.map(async (slug) => {
        const branding = await apiGet<BrandingPayload>(`/api/public/branding/?product=${encodeURIComponent(slug)}`);
        return [slug, normalizeBranding(branding)] as const;
      })
    )
      .then((entries) => {
        if (!active) {
          return;
        }
        setState({
          items: Object.fromEntries(entries),
          loading: false
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setState({ items: {}, loading: false });
      });

    return () => {
      active = false;
    };
  }, [productSlugs.join("|")]);

  return state;
}
