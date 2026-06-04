import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";

import { apiPost } from "@/core/api/http";
import { FORGOT_PASSWORD_API_PATH } from "@/core/config/env";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";

export default function ForgotPasswordScreen() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const response = await apiPost<{ message: string }>(FORGOT_PASSWORD_API_PATH, { email: email.trim() });
      setMessage(response.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <BrandedHeader title="Forgot Password" subtitle="Enter your account email. If it exists, a reset link will be sent." alignCenter />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Send Reset Link</Text>}
        </Pressable>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Login</Text>
          </Pressable>
        </Link>
        {message ? <Text style={styles.success}>{message}</Text> : null}
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
    secondaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48
    },
    secondaryButtonText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontWeight: "700"
    },
    success: {
      color: theme.colors.primary,
      fontSize: 13,
      textAlign: "center"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 13,
      textAlign: "center"
    }
  });
