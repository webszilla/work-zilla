import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";

const products = [
  "Work Suite",
  "Business Autopilot",
  "Online Storage",
  "AI Chatbot"
];

export function ProductSwitcherCard() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Multi-product access</Text>
      <Text style={styles.copy}>One session. One app. Product modules load based on subscription access.</Text>
      <View style={styles.grid}>
        {products.map((product) => (
          <View key={product} style={styles.chip}>
            <Text style={styles.chipText}>{product}</Text>
          </View>
        ))}
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
      padding: 18,
      gap: 14
    },
    title: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800"
    },
    copy: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10
    },
    chip: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    chipText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700"
    }
  });
