import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotAccounts } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotAccounts";
import { useBusinessAutopilotModules } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotModules";
import { useBusinessAutopilotPayroll } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotPayroll";
import { useBusinessAutopilotUsers } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotUsers";

export function BusinessAutopilotProfilePanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const modules = useBusinessAutopilotModules(enabled);
  const users = useBusinessAutopilotUsers(enabled);
  const accounts = useBusinessAutopilotAccounts(enabled);
  const payroll = useBusinessAutopilotPayroll(enabled);
  const styles = createStyles(theme);

  if (modules.loading || users.loading || accounts.loading || payroll.loading) {
    return <Text style={styles.meta}>Loading profile...</Text>;
  }

  if (modules.error || users.error || accounts.error || payroll.error || !modules.data || !accounts.data || !payroll.data || !users.data) {
    return <Text style={styles.error}>{modules.error || users.error || accounts.error || payroll.error || "Unable to load profile"}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{accounts.data.organization_profile.organizationName}</Text>
        <Text style={styles.meta}>Company key: {modules.data.organization?.company_key || "-"}</Text>
        <Text style={styles.meta}>Currency: {payroll.data.organization_profile.currency}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Workspace Access</Text>
        <Text style={styles.meta}>Enabled modules: {modules.data.modules.length}</Text>
        <Text style={styles.meta}>Active users: {users.data.counts.active}</Text>
        <Text style={styles.meta}>Can manage users: {modules.data.can_manage_users ? "Yes" : "No"}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payroll Permissions</Text>
        <Text style={styles.meta}>Manage payroll: {payroll.data.permissions.can_manage_payroll ? "Yes" : "No"}</Text>
        <Text style={styles.meta}>View all payroll: {payroll.data.permissions.can_view_all_payroll ? "Yes" : "No"}</Text>
        <Text style={styles.meta}>View salary history: {payroll.data.permissions.can_view_salary_history ? "Yes" : "No"}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 12
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    title: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
