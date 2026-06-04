import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";

const rows = [
  { name: "Arun Kumar", team: "Sales", status: "Active", metric: "24 calls" },
  { name: "Nivetha S", team: "Support", status: "Pending", metric: "8 tickets" },
  { name: "Priya M", team: "HR", status: "Completed", metric: "5 reviews" }
];

export function MobileTableDemo() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);

  return (
    <View style={styles.wrap}>
      {rows.map((row) => (
        <View key={row.name} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.name}>{row.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{row.status}</Text>
            </View>
          </View>
          <Text style={styles.meta}>{row.team}</Text>
          <Text style={styles.metric}>{row.metric}</Text>
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
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 8
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    name: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      flex: 1
    },
    badge: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7
    },
    badgeText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13
    },
    metric: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600"
    }
  });
