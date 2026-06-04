import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";
import { ProductsSection } from "@/modules/account/components/ProductsSection";
import { useProductBrandingMap } from "@/modules/account/hooks/useProductBrandingMap";
import { useHomeProductPreference } from "@/modules/account/hooks/useHomeProductPreference";
import { useSubscriptions } from "@/modules/account/hooks/useSubscriptions";

export default function ProductsScreen() {
  const { session } = useAuth();
  const theme = useThemeTokens();
  const { items, loading, error } = useSubscriptions(Boolean(session?.authenticated));
  const { selectedSlug, save } = useHomeProductPreference();
  const { items: brandingMap } = useProductBrandingMap(items.map((item) => item.product_slug));
  const styles = createStyles(theme);
  const activeItems = items.filter((item) => ["active", "trialing", "pending"].includes(String(item.status || "").toLowerCase()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      <Text style={styles.title}>Products</Text>
      <Text style={styles.copy}>Choose one product as your login home screen. Only one selection is allowed.</Text>
      {loading ? (
        <View style={styles.note}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.noteText}>Loading products...</Text>
        </View>
      ) : error ? (
        <View style={styles.note}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ProductsSection
          brandingMap={brandingMap}
          subscriptions={activeItems}
          homeProductSlug={selectedSlug}
          onSelectHomeProduct={save}
        />
      )}
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    content: {
      padding: 20,
      gap: 16
    },
    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800"
    },
    copy: {
      color: theme.colors.muted,
      fontSize: 15,
      lineHeight: 22
    },
    note: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16
    },
    noteText: {
      color: theme.colors.text,
      fontSize: 14
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
