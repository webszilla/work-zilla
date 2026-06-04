import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotUsers } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotUsers";

export function BusinessAutopilotUsersPanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const { data, loading, error } = useBusinessAutopilotUsers(enabled);
  const styles = createStyles(theme);

  if (loading) return <Text style={styles.meta}>Loading users...</Text>;
  if (error || !data) return <Text style={styles.error}>{error || "Unable to load users"}</Text>;

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{data.meta.active_users}</Text>
          <Text style={styles.summaryLabel}>Active Users</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{data.meta.remaining_users}</Text>
          <Text style={styles.summaryLabel}>Remaining</Text>
        </View>
      </View>
      {data.users.map((user) => (
        <View key={user.id} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.profileRow}>
              <View style={styles.iconBox}>
                <Ionicons name="person-outline" size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.title}>{user.full_name || user.name || user.email || "User"}</Text>
            </View>
            <Text style={styles.status}>{user.status || "-"}</Text>
          </View>
          <Text style={styles.meta}>{user.email || "-"}</Text>
          <Text style={styles.meta}>{user.employee_role_label || user.profile_role || "-"}</Text>
          <Text style={styles.meta}>{user.department_name || "-"}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    summaryRow: {
      flexDirection: "row",
      gap: 12
    },
    summaryCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16
    },
    summaryValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    summaryLabel: {
      color: theme.colors.muted,
      fontSize: 13,
      marginTop: 4
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    profileRow: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 10
    },
    iconBox: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      height: 34,
      justifyContent: "center",
      width: 34
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      flex: 1
    },
    status: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
