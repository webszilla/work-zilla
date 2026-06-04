import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useBranding } from "@/core/theme/useBranding";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

export function AppTopHeader() {
  const theme = useThemeTokens();
  const { branding } = useBranding();
  const { logout } = useAuth();
  const styles = createStyles(theme);

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)");
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.brandRow}>
        <View style={styles.logoWrap}>
          {branding.logoUrl ? (
            <Image source={{ uri: branding.logoUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={styles.logoText}>WZ</Text>
          )}
        </View>
        <Text style={styles.brandText}>Work Zilla</Text>
      </View>

      <View style={styles.menuRow}>
        <Pressable style={styles.menuButton} onPress={() => router.replace("/(tabs)")}>
          <Ionicons name="home-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.menuText}>Home</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push("/plans")}>
          <Ionicons name="pricetags-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.menuText}>Plans</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.menuText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      flexShrink: 1
    },
    logoWrap: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    logo: {
      height: 28,
      width: 28
    },
    logoText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "800"
    },
    brandText: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    menuRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end"
    },
    menuButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    menuText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700"
    }
  });
