import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type ModuleRow = {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  eligible: boolean;
  path: string;
};

type ModulesResponse = {
  organization: {
    id: number;
    name: string;
    company_key: string;
  } | null;
  modules: ModuleRow[];
  catalog: ModuleRow[];
  can_manage_modules: boolean;
  can_manage_users: boolean;
};

export function useBusinessAutopilotModules(enabled: boolean) {
  const [state, setState] = useState<{ data: ModulesResponse | null; loading: boolean; error: string }>({
    data: null,
    loading: enabled,
    error: ""
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    let active = true;
    apiGet<ModulesResponse>("/api/business-autopilot/modules")
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (active) setState({ data: null, loading: false, error: error.message || "Unable to load modules" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
