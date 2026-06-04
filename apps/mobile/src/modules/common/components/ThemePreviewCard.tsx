import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";

export function ThemePreviewCard() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>Org Theme</Text>
      <Text style={styles.title}>{theme.branding.displayName}</Text>
      <Text style={styles.copy}>Before login shows SaaS admin default theme. After login it switches to org admin theme.</Text>
      <View style={styles.row}>
        <View style={styles.swatch} />
        <Text style={styles.code}>{theme.colors.primary}</Text>
      </View>
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
      padding: 20,
      gap: 12
    },
    badge: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1
    },
    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800"
    },
    copy: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10
    },
    swatch: {
      width: 18,
      height: 18,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.border,
      borderWidth: 2
    },
    code: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    }
  });
