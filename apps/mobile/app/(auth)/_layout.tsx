import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/core/auth/AuthContext";
import { useHomeProductPreference } from "@/modules/account/hooks/useHomeProductPreference";

export default function AuthLayout() {
  const { loading, session } = useAuth();
  const { loading: preferenceLoading, selectedSlug } = useHomeProductPreference();

  if (!loading && !preferenceLoading && session?.authenticated) {
    return <Redirect href={selectedSlug ? `/product/${selectedSlug}` : "/(tabs)"} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
