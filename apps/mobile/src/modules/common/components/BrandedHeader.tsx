import { Image, StyleSheet, Text, View } from "react-native";

import { useBranding } from "@/core/theme/useBranding";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  showBrandRow?: boolean;
  alignCenter?: boolean;
};

export function BrandedHeader({ eyebrow, title, subtitle, showBrandRow = true, alignCenter = false }: Props) {
  const theme = useThemeTokens();
  const { branding } = useBranding();
  const styles = createStyles(theme, alignCenter);

  return (
    <View style={styles.stack}>
      {showBrandRow ? (
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}>
            {branding.logoUrl ? (
              <Image source={{ uri: branding.logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text style={styles.logoText}>WZ</Text>
            )}
          </View>
          <Text style={styles.brandText}>Work Zilla</Text>
        </View>
      ) : null}
      <View style={styles.wrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>, alignCenter: boolean) =>
  StyleSheet.create({
    stack: {
      gap: 14
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: alignCenter ? "center" : "flex-start"
    },
    wrap: {
      alignItems: alignCenter ? "center" : "flex-start",
      gap: 4
    },
    logoWrap: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      height: 42,
      justifyContent: "center",
      overflow: "hidden",
      width: 42
    },
    logo: {
      height: 30,
      width: 30
    },
    logoText: {
      color: "#ffffff",
      fontSize: 17,
      fontWeight: "800"
    },
    brandText: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      textAlign: alignCenter ? "center" : "left"
    },
    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: alignCenter ? "center" : "left"
    },
    subtitle: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: alignCenter ? "center" : "left"
    }
  });
