import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type PayrollResponse = {
  organization_profile: {
    organizationName: string;
    country: string;
    currency: string;
    timezone: string;
  };
  salary_structures: unknown[];
  salary_history: unknown[];
  payroll_entries: unknown[];
  payslips: unknown[];
  employee_directory: unknown[];
  permissions: {
    can_manage_payroll: boolean;
    can_view_all_payroll: boolean;
    can_view_salary_history: boolean;
  };
};

export function useBusinessAutopilotPayroll(enabled: boolean) {
  const [state, setState] = useState<{ data: PayrollResponse | null; loading: boolean; error: string }>({
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
    apiGet<PayrollResponse>("/api/business-autopilot/payroll/workspace")
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (active) setState({ data: null, loading: false, error: error.message || "Unable to load payroll" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
