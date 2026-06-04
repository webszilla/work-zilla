import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { WEBSITE_PRICING_URL } from "@/core/config/env";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotAccounts } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotAccounts";
import { useBusinessAutopilotModules } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotModules";
import { useBusinessAutopilotPayroll } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotPayroll";
import { useBusinessAutopilotUsers } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotUsers";

type Props = {
  enabled: boolean;
  onShortcutPress?: (key: string) => void;
};

export function BusinessAutopilotDashboardPanel({ enabled, onShortcutPress }: Props) {
  const theme = useThemeTokens();
  const modules = useBusinessAutopilotModules(enabled);
  const users = useBusinessAutopilotUsers(enabled);
  const accounts = useBusinessAutopilotAccounts(enabled);
  const payroll = useBusinessAutopilotPayroll(enabled);
  const styles = createStyles(theme);

  if (modules.loading || users.loading || accounts.loading || payroll.loading) {
    return <Text style={styles.meta}>Loading Business Autopilot dashboard...</Text>;
  }

  if (modules.error || users.error || accounts.error || payroll.error) {
    return <Text style={styles.error}>{modules.error || users.error || accounts.error || payroll.error}</Text>;
  }

  const enabledModules = modules.data?.modules || [];
  const accountsData = accounts.data?.data;
  const enabledModuleSlugs = new Set(enabledModules.map((item) => String(item.slug || "").toLowerCase()));
  const shortcuts = [
    { key: "inbox", label: "Inbox", icon: "mail-outline", active: true },
    { key: "crm", label: "CRM", icon: "people-outline", active: enabledModuleSlugs.has("crm") },
    { key: "hrm", label: "HRM", icon: "person-outline", active: enabledModuleSlugs.has("hrm") },
    { key: "projects", label: "Projects", icon: "folder-outline", active: enabledModuleSlugs.has("projects") },
    { key: "accounts", label: "Accounts", icon: "card-outline", active: enabledModuleSlugs.has("accounts") },
    { key: "ticketing", label: "Tickets", icon: "ticket-outline", active: enabledModuleSlugs.has("ticketing") },
    { key: "stocks", label: "Inventory", icon: "cube-outline", active: enabledModuleSlugs.has("stocks") || enabledModuleSlugs.has("inventory") },
    { key: "users", label: "Users", icon: "people-circle-outline", active: Boolean(users.data?.counts.active) },
    { key: "billing", label: "Billing", icon: "wallet-outline", active: true },
    { key: "subscriptions", label: "Plans", icon: "pricetags-outline", active: enabledModuleSlugs.has("subscriptions") || true },
    { key: "profile", label: "Profile", icon: "person-circle-outline", active: true },
    { key: "wz-products", label: "WZ Products", icon: "storefront-outline", active: true, href: WEBSITE_PRICING_URL }
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.shortcutsSection}>
        <Text style={styles.sectionTitle}>Quick Menu</Text>
        <View style={styles.shortcutsGrid}>
          {shortcuts.map((item) => (
            <Pressable
              key={item.key}
              style={styles.shortcutItem}
              onPress={
                item.href
                  ? () => Linking.openURL(item.href as string)
                  : onShortcutPress
                    ? () => onShortcutPress(item.key)
                    : undefined
              }
            >
              <View style={[styles.shortcutIconWrap, item.active ? styles.shortcutIconWrapActive : null]}>
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={item.active ? theme.colors.primary : theme.colors.muted}
                />
              </View>
              <Text style={styles.shortcutLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        <MetricCard label="Modules" value={enabledModules.length} theme={theme} />
        <MetricCard label="Users" value={users.data?.counts.active || 0} theme={theme} />
        <MetricCard label="Customers" value={accountsData?.customers.length || 0} theme={theme} />
        <MetricCard label="Invoices" value={accountsData?.invoices.length || 0} theme={theme} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Workspace</Text>
        <Text style={styles.meta}>{modules.data?.organization?.name || "-"}</Text>
        <Text style={styles.meta}>Company key: {modules.data?.organization?.company_key || "-"}</Text>
        <Text style={styles.meta}>Payroll currency: {payroll.data?.organization_profile.currency || "INR"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Enabled Modules</Text>
        <View style={styles.chips}>
          {enabledModules.map((item) => (
            <View key={item.slug} style={styles.chip}>
              <Text style={styles.chipText}>{item.name}</Text>
            </View>
          ))}
        </View>
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
    shortcutsSection: {
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 14,
      backgroundColor: theme.colors.surface
    },
    shortcutsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      justifyContent: "space-between"
    },
    shortcutItem: {
      alignItems: "center",
      gap: 8,
      width: "22%"
    },
    shortcutIconWrap: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48
    },
    shortcutIconWrapActive: {
      backgroundColor: theme.colors.primarySoft
    },
    shortcutLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center"
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
    },
    section: {
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 10,
      backgroundColor: theme.colors.surface
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
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    chip: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    chipText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
