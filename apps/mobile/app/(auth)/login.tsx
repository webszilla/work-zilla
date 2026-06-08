import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";

import { useAuth } from "@/core/auth/AuthContext";
import { getHomeProductSlug } from "@/core/preferences/homeProduct";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";

export default function LoginScreen() {
  const theme = useThemeTokens();
  const { login } = useAuth();
  const styles = createStyles(theme);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    try {
      setSubmitting(true);
      setError("");
      await login(username.trim(), password);
      const selectedSlug = await getHomeProductSlug();
      router.replace(selectedSlug ? `/product/${selectedSlug}` : "/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <BrandedHeader title="Login" subtitle="Use your existing WorkZilla account." alignCenter />
        <TextInput
          autoCapitalize="none"
          placeholder="Email or username"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Login</Text>}
        </Pressable>
        <View style={styles.linkRow}>
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          </Link>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.linkText}>Create Account</Text>
            </Pressable>
          </Link>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: theme.colors.background
    },
    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 24,
      gap: 14
    },
    input: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.colors.text,
      fontSize: 14,
      paddingHorizontal: 16,
      paddingVertical: 14
    },
    button: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700"
    },
    linkRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    linkText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: "600"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 13
    }
  });
