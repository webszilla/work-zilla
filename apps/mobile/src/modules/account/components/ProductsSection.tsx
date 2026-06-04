import { StyleSheet, Text, View } from "react-native";

import { BrandingPayload, ProductSubscription } from "@/core/theme/types";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { ProductAccessCard } from "@/modules/account/components/ProductAccessCard";

type Props = {
  brandingMap: Record<string, BrandingPayload>;
  subscriptions: ProductSubscription[];
  homeProductSlug?: string;
  onSelectHomeProduct?: (productSlug: string) => void;
};

export function ProductsSection({ brandingMap, subscriptions, homeProductSlug = "", onSelectHomeProduct }: Props) {
  const theme = useThemeTokens();
  const styles = createStyles(theme);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Your Products</Text>
      <Text style={styles.copy}>Tap a product to open it. Select one product as your home screen after login.</Text>
      <View style={styles.list}>
        {subscriptions.map((subscription) => (
          <ProductAccessCard
            key={`${subscription.product_slug}-${subscription.plan_id || subscription.status}`}
            branding={brandingMap[subscription.product_slug]}
            subscription={subscription}
            isHomeProduct={homeProductSlug === subscription.product_slug}
            onSelectHomeProduct={onSelectHomeProduct}
          />
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 10
    },
    title: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    copy: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    list: {
      gap: 12
    }
  });
