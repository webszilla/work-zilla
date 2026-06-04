import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type AccountsResponse = {
  organization: {
    id: number;
    name: string;
    company_key: string;
  } | null;
  organization_profile: {
    organizationName: string;
    country: string;
    currency: string;
    timezone: string;
  };
  data: {
    customers: unknown[];
    vendors: unknown[];
    itemMasters: unknown[];
    gstTemplates: unknown[];
    billingTemplates: unknown[];
    estimates: unknown[];
    invoices: unknown[];
  };
};

export function useBusinessAutopilotAccounts(enabled: boolean) {
  const [state, setState] = useState<{ data: AccountsResponse | null; loading: boolean; error: string }>({
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
    apiGet<AccountsResponse>("/api/business-autopilot/accounts/workspace")
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (active) setState({ data: null, loading: false, error: error.message || "Unable to load accounts" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
