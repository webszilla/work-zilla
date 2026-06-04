import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useWorksuiteDashboard } from "@/modules/worksuite/hooks/useWorksuiteDashboard";

type Props = {
  enabled: boolean;
};

export function WorksuiteDashboardPanel({ enabled }: Props) {
  const theme = useThemeTokens();
  const { data, loading, error } = useWorksuiteDashboard(enabled);
  const styles = createStyles(theme);

  if (loading) {
    return <Text style={styles.meta}>Loading dashboard...</Text>;
  }

  if (error || !data) {
    return <Text style={styles.error}>{error || "Unable to load dashboard"}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        <MetricCard label="Employees" value={data.stats.employees} theme={theme} />
        <MetricCard label="Online" value={data.stats.online} theme={theme} />
        <MetricCard label="Activities" value={data.stats.activities} theme={theme} />
        <MetricCard label="Screenshots" value={data.stats.screenshots} theme={theme} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <Text style={styles.meta}>
          {data.subscription?.plan || "No active plan"} · {data.subscription?.status || "inactive"}
        </Text>
        <Text style={styles.meta}>Company key: {data.org.company_key || "-"}</Text>
        <Text style={styles.meta}>Screenshot interval: {data.settings.screenshot_interval_minutes} minutes</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Apps</Text>
        {data.top_apps.length ? data.top_apps.map((row) => (
          <View key={row.app_name} style={styles.row}>
            <Text style={styles.rowLabel}>{row.app_name || "Unknown App"}</Text>
            <Text style={styles.rowValue}>{row.count}</Text>
          </View>
        )) : <Text style={styles.meta}>No app usage yet.</Text>}
      </View>
    </View>
  );
}

function MetricCard({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useThemeTokens> }) {
  return (
    <View style={[metricStyles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[metricStyles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[metricStyles.label, { color: theme.colors.muted }]}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    gap: 6,
    padding: 16
  },
  value: {
    fontSize: 24,
    fontWeight: "800"
  },
  label: {
    fontSize: 13
  }
});

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 14
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
    },
    section: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 10
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    rowLabel: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 14
    },
    rowValue: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
