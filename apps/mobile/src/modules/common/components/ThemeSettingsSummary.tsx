import { StyleSheet, Text, View } from "react-native";

import { useBranding } from "@/core/theme/useBranding";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

export function ThemeSettingsSummary() {
  const theme = useThemeTokens();
  const { branding, loading, error } = useBranding();
  const styles = createStyles(theme);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Brand sync status</Text>
      <Text style={styles.item}>Product: {branding.displayName}</Text>
      <Text style={styles.item}>Primary: {branding.primaryColor || theme.colors.primary}</Text>
      <Text style={styles.item}>Status: {loading ? "Loading" : error ? error : "Synced"}</Text>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 18,
      gap: 12
    },
    title: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800"
    },
    item: {
      color: theme.colors.muted,
      fontSize: 14
    }
  });
