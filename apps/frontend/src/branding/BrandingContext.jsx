import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const BrandingContext = createContext({
  loading: true,
  error: "",
  branding: null
});

function buildFallbackBranding(productKey) {
  const key = productKey || "worksuite";
  const displayName = key === "worksuite"
    ? "Work Suite"
    : key === "ai-chatbot"
    ? "AI Chatbot"
    : key === "storage"
    ? "Online Storage"
    : key === "saas-admin"
    ? "SaaS Admin"
    : "Work Zilla";

  return {
    key,
    displayName,
    tagline: "",
    description: "",
    logoUrl: "",
    primaryColor: "",
    publicSlug: key,
    legacySlugs: [],
    aliases: {
      ui: {
        monitorLabel: key === "worksuite" ? displayName : "Work Suite"
      },
      marketing: {},
      email: {}
    }
  };
}

export function BrandingProvider({ productKey, children }) {
  const [state, setState] = useState(() => ({
    loading: true,
    error: "",
    branding: buildFallbackBranding(productKey)
  }));
  const cacheRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    const key = productKey || "worksuite";
    const cached = cacheRef.current.get(key);

    if (cached?.data) {
      setState({
        loading: false,
        error: "",
        branding: cached.data
      });
    } else {
      setState((prev) => ({
        ...prev,
        loading: true,
        branding: buildFallbackBranding(key)
      }));
    }

    async function loadBranding() {
      try {
        const headers = {};
        if (cached?.etag) {
          headers["If-None-Match"] = cached.etag;
        }
        const response = await fetch(`/api/public/branding/?product=${encodeURIComponent(key)}`, {
          credentials: "include",
          headers
        });
        if (!active) {
          return;
        }
        if (response.status === 304 && cached?.data) {
          setState({
            loading: false,
            error: "",
            branding: cached.data
          });
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load branding");
        }
        const data = await response.json();
        const etag = response.headers.get("ETag");
        cacheRef.current.set(key, { data, etag });
        setState({ loading: false, error: "", branding: data });
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Unable to load branding"
          }));
        }
      }
    }

    loadBranding();
    return () => {
      active = false;
    };
  }, [productKey]);

  const value = useMemo(() => state, [state]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
