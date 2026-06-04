import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";

export default function AuthHomeScreen() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandedHeader
        eyebrow=""
        title="Login or create your account."
        subtitle=""
        alignCenter
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome</Text>
        <Text style={styles.cardCopy}>Use native login, or create a new account and continue to native pricing plans.</Text>
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Text style={styles.pillValue}>One</Text>
            <Text style={styles.pillLabel}>App</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillValue}>All</Text>
            <Text style={styles.pillLabel}>Products</Text>
          </View>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.primaryButtonText}>Login</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.secondaryButtonText}>Create Account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    content: {
      padding: 20,
      gap: 16,
      justifyContent: "center",
      minHeight: "100%"
    },
    card: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 20,
      gap: 14,
      backgroundColor: theme.colors.surface
    },
    pillRow: {
      flexDirection: "row",
      gap: 12
    },
    pill: {
      alignItems: "center",
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    pillValue: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center"
    },
    pillLabel: {
      color: theme.colors.muted,
      fontSize: 12,
      marginTop: 2,
      textAlign: "center"
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center"
    },
    cardCopy: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center"
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 54,
      width: "100%"
    },
    primaryButtonText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "700"
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 52,
      width: "100%"
    },
    secondaryButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: "700"
    }
  });
