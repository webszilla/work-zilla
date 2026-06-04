import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useWorksuiteEmployees } from "@/modules/worksuite/hooks/useWorksuiteEmployees";

type Props = {
  enabled: boolean;
};

export function WorksuiteEmployeesPanel({ enabled }: Props) {
  const theme = useThemeTokens();
  const { data, loading, error } = useWorksuiteEmployees(enabled);
  const styles = createStyles(theme);

  if (loading) {
    return <Text style={styles.meta}>Loading employees...</Text>;
  }

  if (error || !data) {
    return <Text style={styles.error}>{error || "Unable to load employees"}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Employees</Text>
        <Text style={styles.meta}>
          {data.meta.employee_count} / {data.meta.employee_limit || "Unlimited"} in use
        </Text>
      </View>
      {data.employees.map((employee) => (
        <View key={employee.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={[styles.status, { color: employee.is_online ? theme.colors.success : theme.colors.muted }]}>
              {employee.status}
            </Text>
          </View>
          <Text style={styles.meta}>{employee.email || employee.pc_name || "-"}</Text>
          <Text style={styles.meta}>Device: {employee.device_id}</Text>
          <Text style={styles.meta}>Last seen: {employee.last_seen || "-"}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 12
    },
    section: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    name: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 16,
      fontWeight: "700"
    },
    status: {
      fontSize: 13,
      fontWeight: "700"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 19
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
