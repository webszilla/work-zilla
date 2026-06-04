import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

type Props = {
  activeCount: number;
};

export function AccountOverviewCard({ activeCount }: Props) {
  const theme = useThemeTokens();
  const { session } = useAuth();
  const styles = createStyles(theme);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>My Account</Text>
      <Text style={styles.title}>{session?.profile?.organization?.name || "Organization"}</Text>
      <Text style={styles.meta}>
        {session?.user?.first_name || session?.user?.username || "User"} · {session?.profile?.role || "member"}
      </Text>
      <View style={styles.stats}>
        <View style={styles.statBox}>
          <View style={styles.statHead}>
            <View style={styles.iconBox}>
              <Ionicons name="grid-outline" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{activeCount}</Text>
          </View>
          <Text style={styles.statLabel}>Products</Text>
        </View>
        <View style={styles.statBox}>
          <View style={styles.statHead}>
            <View style={styles.iconBox}>
              <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{session?.accessible_products?.length || 0}</Text>
          </View>
          <Text style={styles.statLabel}>Access</Text>
        </View>
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
      gap: 14
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1
    },
    title: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: "800"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 14
    },
    stats: {
      flexDirection: "row",
      gap: 12
    },
    statBox: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 14
    },
    statHead: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10
    },
    iconBox: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 8,
      height: 36,
      justifyContent: "center",
      width: 36
    },
    statValue: {
      color: theme.colors.primary,
      fontSize: 22,
      fontWeight: "800"
    },
    statLabel: {
      color: theme.colors.muted,
      fontSize: 13,
      marginTop: 4
    }
  });
