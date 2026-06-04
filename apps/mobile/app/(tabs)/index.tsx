import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { AccountOverviewCard } from "@/modules/account/components/AccountOverviewCard";
import { ProductsSection } from "@/modules/account/components/ProductsSection";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";
import { useProductBrandingMap } from "@/modules/account/hooks/useProductBrandingMap";
import { useHomeProductPreference } from "@/modules/account/hooks/useHomeProductPreference";
import { useSubscriptions } from "@/modules/account/hooks/useSubscriptions";

export default function HomeScreen() {
  const theme = useThemeTokens();
  const { session } = useAuth();
  const { items, loading, error } = useSubscriptions(Boolean(session?.authenticated));
  const { selectedSlug, save } = useHomeProductPreference();
  const { items: brandingMap } = useProductBrandingMap(items.map((item) => item.product_slug));
  const styles = createStyles(theme);
  const activeItems = items.filter((item) => ["active", "trialing", "pending"].includes(String(item.status || "").toLowerCase()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      <BrandedHeader
        eyebrow="WorkZilla Mobile"
        title="My Account"
        subtitle="Your subscribed products, access, and mobile workspaces in one native layout."
        showBrandRow={false}
      />
      <AccountOverviewCard activeCount={activeItems.length} />
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your products...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
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
    loadingBox: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      gap: 10,
      padding: 20
    },
    loadingText: {
      color: theme.colors.muted,
      fontSize: 14
    },
    errorBox: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 20
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
