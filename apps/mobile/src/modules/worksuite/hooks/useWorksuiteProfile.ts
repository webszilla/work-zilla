import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";

type ProfileResponse = {
  org: {
    id: number;
    name: string;
  };
  user: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    profile_photo_url: string;
  };
  profile: {
    role: string;
    role_label: string;
    organization: {
      id: number;
      name: string;
    };
    phone_number: string;
    profile_photo_url: string;
  };
  org_timezone: string;
  theme_primary: string;
  theme_secondary: string;
  security: {
    session_timeout_minutes: number;
    can_manage: boolean;
  };
};

export function useWorksuiteProfile(enabled: boolean) {
  const [state, setState] = useState<{
    data: ProfileResponse | null;
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
    apiGet<ProfileResponse>("/api/dashboard/profile")
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
        setState({ data: null, loading: false, error: error.message || "Unable to load profile" });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
