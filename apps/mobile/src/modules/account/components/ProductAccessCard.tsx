import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";

import { BrandingPayload, ProductSubscription } from "@/core/theme/types";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

type Props = {
  branding?: BrandingPayload;
  subscription: ProductSubscription;
  isHomeProduct?: boolean;
  onSelectHomeProduct?: (productSlug: string) => void;
};

function buildStatusLabel(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "Unknown";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function ProductAccessCard({ branding, subscription, isHomeProduct = false, onSelectHomeProduct }: Props) {
  const theme = useThemeTokens();
  const accent = branding?.themePrimary || theme.colors.primary;
  const styles = createStyles(theme, accent);

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/product/${subscription.product_slug}`)}
    >
      <View style={styles.innerCard}>
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            {branding?.logoUrl ? (
              <Image source={{ uri: branding.logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text style={styles.logoText}>WZ</Text>
            )}
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>{subscription.product_name}</Text>
            <Text style={styles.plan}>{subscription.plan_name || "Subscribed product"}</Text>
          </View>
          <Pressable
            style={[styles.homeSelector, isHomeProduct ? styles.homeSelectorActive : null]}
            onPress={(event) => {
              event.stopPropagation?.();
              onSelectHomeProduct?.(subscription.product_slug);
            }}
          >
            <Ionicons
              name={isHomeProduct ? "checkmark-circle" : "ellipse-outline"}
              size={16}
              color={isHomeProduct ? accent : theme.colors.muted}
            />
            <Text style={[styles.homeSelectorText, isHomeProduct ? styles.homeSelectorTextActive : null]}>My Home Screen</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <View style={styles.metaBox}>
            <View style={styles.metaIconBox}>
              <Ionicons name="bag-handle-outline" size={16} color={accent} />
            </View>
            <Text style={styles.badge}>{buildStatusLabel(subscription.status)}</Text>
          </View>
          <View style={styles.metaBox}>
            <View style={styles.metaIconBox}>
              <Ionicons name="shield-checkmark-outline" size={16} color={accent} />
            </View>
            <Text style={styles.permission}>{subscription.permission || subscription.access_role || "access"}</Text>
          </View>
        </View>
        <Text style={styles.launch}>Open mobile workspace</Text>
      </View>
    </Pressable>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>, accent: string) =>
  StyleSheet.create({
    card: {
      borderRadius: 8
    },
    innerCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 18,
      gap: 14
    },
    header: {
      flexDirection: "row",
      gap: 14,
      alignItems: "center"
    },
    logoWrap: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      height: 54,
      justifyContent: "center",
      overflow: "hidden",
      width: 54
    },
    logo: {
      height: 42,
      width: 42
    },
    logoText: {
      color: accent,
      fontSize: 18,
      fontWeight: "800"
    },
    headText: {
      flex: 1,
      gap: 3
    },
    homeSelector: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    homeSelectorActive: {
      backgroundColor: theme.colors.primarySoft
    },
    homeSelectorText: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: "700"
    },
    homeSelectorTextActive: {
      color: accent
    },
    title: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "800"
    },
    plan: {
      color: theme.colors.muted,
      fontSize: 13
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12
    },
    metaBox: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8
    },
    metaIconBox: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      height: 32,
      justifyContent: "center",
      width: 32
    },
    badge: {
      color: accent,
      fontSize: 13,
      fontWeight: "700"
    },
    permission: {
      color: theme.colors.muted,
      fontSize: 13
    },
    launch: {
      color: accent,
      fontSize: 14,
      fontWeight: "700"
    }
  });
