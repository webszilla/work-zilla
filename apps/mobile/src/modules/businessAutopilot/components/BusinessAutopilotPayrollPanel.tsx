import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotPayroll } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotPayroll";

export function BusinessAutopilotPayrollPanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const { data, loading, error } = useBusinessAutopilotPayroll(enabled);
  const styles = createStyles(theme);

  if (loading) return <Text style={styles.meta}>Loading payroll...</Text>;
  if (error || !data) return <Text style={styles.error}>{error || "Unable to load payroll"}</Text>;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{data.organization_profile.organizationName}</Text>
        <Text style={styles.meta}>
          {data.organization_profile.country} · {data.organization_profile.currency} · {data.organization_profile.timezone}
        </Text>
      </View>
      <View style={styles.grid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{data.salary_structures.length}</Text>
          <Text style={styles.metricLabel}>Structures</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{data.payroll_entries.length}</Text>
          <Text style={styles.metricLabel}>Entries</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Payroll Overview</Text>
        <Text style={styles.meta}>Structures: {data.salary_structures.length}</Text>
        <Text style={styles.meta}>Salary history: {data.salary_history.length}</Text>
        <Text style={styles.meta}>Entries: {data.payroll_entries.length}</Text>
        <Text style={styles.meta}>Payslips: {data.payslips.length}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    grid: {
      flexDirection: "row",
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
    metricCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flex: 1,
      padding: 16
    },
    metricValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    metricLabel: {
      color: theme.colors.muted,
      fontSize: 13,
      marginTop: 4
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
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
