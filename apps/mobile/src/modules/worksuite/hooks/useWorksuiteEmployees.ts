import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type EmployeeRow = {
  id: number;
  name: string;
  email: string;
  pc_name: string;
  device_id: string;
  last_seen: string;
  status: string;
  is_online: boolean;
};

type EmployeesResponse = {
  employees: EmployeeRow[];
  meta: {
    employee_limit: number;
    employee_count: number;
    addon_count: number;
    can_add: boolean;
    screenshot_interval_minutes: number;
  };
};

export function useWorksuiteEmployees(enabled: boolean) {
  const [state, setState] = useState<{
    data: EmployeesResponse | null;
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
    apiGet<EmployeesResponse>("/api/dashboard/employees")
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
        setState({ data: null, loading: false, error: error.message || "Unable to load employees" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
