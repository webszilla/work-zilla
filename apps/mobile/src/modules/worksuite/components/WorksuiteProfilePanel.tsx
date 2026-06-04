import { StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useWorksuiteProfile } from "@/modules/worksuite/hooks/useWorksuiteProfile";

type Props = {
  enabled: boolean;
};

export function WorksuiteProfilePanel({ enabled }: Props) {
  const theme = useThemeTokens();
  const { data, loading, error } = useWorksuiteProfile(enabled);
  const styles = createStyles(theme);

  if (loading) {
    return <Text style={styles.meta}>Loading profile...</Text>;
  }

  if (error || !data) {
    return <Text style={styles.error}>{error || "Unable to load profile"}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{`${data.user.first_name} ${data.user.last_name}`.trim() || data.user.username}</Text>
        <Text style={styles.meta}>{data.user.email || "-"}</Text>
        <Text style={styles.meta}>{data.profile.role_label}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Organization</Text>
        <Text style={styles.meta}>{data.org.name}</Text>
        <Text style={styles.meta}>Timezone: {data.org_timezone}</Text>
        <Text style={styles.meta}>Session timeout: {data.security.session_timeout_minutes} mins</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Theme</Text>
        <Text style={styles.meta}>Primary: {data.theme_primary}</Text>
        <Text style={styles.meta}>Secondary: {data.theme_secondary}</Text>
      </View>
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
    title: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
