import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { ThemeSettingsSummary } from "@/modules/common/components/ThemeSettingsSummary";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";

export default function ProfileScreen() {
  const theme = useThemeTokens();
  const { logout } = useAuth();
  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      <Text style={styles.title}>Dynamic org theme</Text>
      <Text style={styles.copy}>
        Mobile app reads org admin branding and applies colors across cards, buttons, tabs, and forms.
      </Text>
      <ThemeSettingsSummary />
      <Pressable style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
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
    button: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 50
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700"
    }
  });
