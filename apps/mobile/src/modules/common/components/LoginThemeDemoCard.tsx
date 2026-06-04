import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeTokens } from "@/core/theme/useThemeTokens";

export function LoginThemeDemoCard() {
  const theme = useThemeTokens();
  const { session, loading, error, login, logout } = useAuth();
  const styles = createStyles(theme);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleLogin = async () => {
    try {
      setSubmitting(true);
      setSubmitError("");
      await login(username.trim(), password);
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Login failed";
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      setSubmitting(true);
      setSubmitError("");
      await logout();
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Logout failed";
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Theme auth flow</Text>
      <Text style={styles.copy}>
        {session?.authenticated
          ? `Logged in as ${session.user?.email || session.user?.username || "user"}. Org theme is active now.`
          : "Current preview is using SaaS admin default theme. Login will switch to org theme."}
      </Text>
      {session?.authenticated ? (
        <Pressable style={styles.button} onPress={handleLogout} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? "Please wait..." : "Logout"}</Text>
        </Pressable>
      ) : (
        <>
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
          <Pressable style={styles.button} onPress={handleLogin} disabled={submitting || loading}>
            {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Login</Text>}
          </Pressable>
        </>
      )}
      {error || submitError ? <Text style={styles.error}>{submitError || error}</Text> : null}
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
      gap: 12
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
    input: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.colors.text,
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    button: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 16
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 13
    }
  });
