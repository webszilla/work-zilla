import { useEffect, useState } from "react";

import { apiGet } from "@/core/api/http";
import { ProductSubscription, SubscriptionsResponse } from "@/core/theme/types";

type SubscriptionsState = {
  items: ProductSubscription[];
  loading: boolean;
  error: string;
};

export function useSubscriptions(enabled: boolean) {
  const [state, setState] = useState<SubscriptionsState>({
    items: [],
    loading: enabled,
    error: ""
  });

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: "" });
      return;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));

    apiGet<SubscriptionsResponse>("/api/auth/subscriptions")
      .then((data) => {
        if (!active) {
          return;
        }
        setState({
          items: data.subscriptions || [],
          loading: false,
          error: ""
        });
      })
      .catch((error: Error) => {
        if (!active) {
          return;
        }
        setState({
          items: [],
          loading: false,
          error: error.message || "Unable to load subscriptions"
        });
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return state;
}
