import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotModules } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotModules";

const moduleIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  crm: "people-outline",
  hrm: "person-outline",
  projects: "folder-outline",
  accounts: "card-outline",
  subscriptions: "pricetags-outline",
  ticketing: "ticket-outline",
  stocks: "cube-outline",
  inventory: "cube-outline",
  users: "people-circle-outline",
  billing: "wallet-outline",
  inbox: "mail-outline"
};

export function BusinessAutopilotModulesPanel({
  enabled,
  onOpenModule
}: {
  enabled: boolean;
  onOpenModule?: (slug: string) => void;
}) {
  const theme = useThemeTokens();
  const { data, loading, error } = useBusinessAutopilotModules(enabled);
  const styles = createStyles(theme);

  if (loading) return <Text style={styles.meta}>Loading modules...</Text>;
  if (error || !data) return <Text style={styles.error}>{error || "Unable to load modules"}</Text>;

  return (
    <View style={styles.wrap}>
      {data.catalog.map((module) => (
        <Pressable
          key={module.slug}
          style={styles.card}
          onPress={onOpenModule ? () => onOpenModule(module.slug) : undefined}
        >
          {(() => {
            const iconName = moduleIcons[String(module.slug || "").toLowerCase()] || "apps-outline";
            return (
          <View style={styles.row}>
            <View style={styles.titleRow}>
              <View style={styles.iconBox}>
                <Ionicons name={iconName} size={18} color={theme.colors.primary} />
              </View>
              <Text style={styles.title}>{module.name}</Text>
            </View>
            <Text style={[styles.status, { color: module.enabled ? theme.colors.success : theme.colors.muted }]}>
              {module.enabled ? "Enabled" : module.eligible ? "Available" : "Locked"}
            </Text>
          </View>
            );
          })()}
          <Text style={styles.meta}>Path: {module.path}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    titleRow: {
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
