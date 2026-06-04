import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type UsersResponse = {
  users: Array<{
    id: number;
    full_name?: string;
    name?: string;
    email?: string;
    phone_number?: string;
    employee_role_label?: string;
    department_name?: string;
    status?: string;
    profile_role?: string;
  }>;
  counts: {
    all: number;
    active: number;
    inactive: number;
    resigned: number;
    deleted: number;
  };
  meta: {
    employee_limit: number;
    used_users: number;
    remaining_users: number;
    can_add_users: boolean;
    active_users: number;
  };
};

export function useBusinessAutopilotUsers(enabled: boolean) {
  const [state, setState] = useState<{ data: UsersResponse | null; loading: boolean; error: string }>({
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
    apiGet<UsersResponse>("/api/business-autopilot/users")
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (active) setState({ data: null, loading: false, error: error.message || "Unable to load users" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
