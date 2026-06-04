import { useEffect, useState } from "react";

import { getHomeProductSlug, setHomeProductSlug } from "@/core/preferences/homeProduct";

export function useHomeProductPreference() {
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getHomeProductSlug()
      .then((value) => {
        if (active) {
          setSelectedSlug(value);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (productSlug: string) => {
    const value = String(productSlug || "").trim();
    await setHomeProductSlug(value);
    setSelectedSlug(value);
  };

  return {
    selectedSlug,
    loading,
    save
  };
}
