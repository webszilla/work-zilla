import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type DashboardResponse = {
  org: {
    id: number;
    name: string;
    company_key: string;
    created_at: string;
  };
  stats: {
    employees: number;
    online: number;
    activities: number;
    screenshots: number;
  };
  top_apps: Array<{ app_name: string; count: number }>;
  subscription: null | {
    plan: string;
    employee_limit: number;
    addon_count: number;
    billing_cycle: string;
    end_date: string;
    retention_days: number;
    allow_addons: boolean;
    status: string;
  };
  settings: {
    screenshot_interval_minutes: number;
  };
  usage_alerts: Array<{ employee: string; app: string; time: string }>;
};

export function useWorksuiteDashboard(enabled: boolean) {
  const [state, setState] = useState<{
    data: DashboardResponse | null;
    loading: boolean;
    error: string;
  }>({
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
    setState((current) => ({ ...current, loading: true, error: "" }));
    apiGet<DashboardResponse>("/api/dashboard/summary")
      .then((data) => {
        if (!active) {
          return;
        }
        setState({ data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (!active) {
          return;
        }
        setState({ data: null, loading: false, error: error.message || "Unable to load dashboard" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
