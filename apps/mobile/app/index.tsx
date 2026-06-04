import { Redirect } from "expo-router";

import { useAuth } from "@/core/auth/AuthContext";
import { useHomeProductPreference } from "@/modules/account/hooks/useHomeProductPreference";

export default function IndexScreen() {
  const { loading, session } = useAuth();
  const { loading: preferenceLoading, selectedSlug } = useHomeProductPreference();

  if (loading || preferenceLoading) {
    return null;
  }

  if (session?.authenticated && selectedSlug) {
    return <Redirect href={`/product/${selectedSlug}`} />;
  }

  return <Redirect href={session?.authenticated ? "/(tabs)" : "/(auth)"} />;
}
