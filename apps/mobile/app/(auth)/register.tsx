import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";

export default function RegisterScreen() {
  const theme = useThemeTokens();
  const { signup } = useAuth();
  const styles = createStyles(theme);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    company_name: "",
    phone_number: "",
    password1: "",
    password2: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSignup = async () => {
    try {
      setSubmitting(true);
      setError("");
      await signup(form);
      router.replace("/plans?fromSignup=1");
    } catch (reason) {
      if (reason instanceof Error && "payload" in reason && reason.payload && typeof reason.payload === "object") {
        const payload = reason.payload as { field_errors?: Record<string, string[]>; non_field_errors?: string[] };
        const firstFieldError = payload.field_errors
          ? Object.values(payload.field_errors).flat()[0]
          : "";
        setError(firstFieldError || payload.non_field_errors?.[0] || reason.message);
      } else {
        setError(reason instanceof Error ? reason.message : "Signup failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <BrandedHeader title="Create Account" subtitle="Create your account and continue with native pricing plans." alignCenter />
        <TextInput placeholder="First name" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.first_name} onChangeText={(value) => updateField("first_name", value)} />
        <TextInput placeholder="Last name" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.last_name} onChangeText={(value) => updateField("last_name", value)} />
        <TextInput autoCapitalize="none" placeholder="Username" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.username} onChangeText={(value) => updateField("username", value)} />
        <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.email} onChangeText={(value) => updateField("email", value)} />
        <TextInput placeholder="Company name" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.company_name} onChangeText={(value) => updateField("company_name", value)} />
        <TextInput keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.phone_number} onChangeText={(value) => updateField("phone_number", value)} />
        <TextInput secureTextEntry placeholder="Password" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.password1} onChangeText={(value) => updateField("password1", value)} />
        <TextInput secureTextEntry placeholder="Confirm password" placeholderTextColor={theme.colors.muted} style={styles.input} value={form.password2} onChangeText={(value) => updateField("password2", value)} />
        <Pressable style={styles.button} onPress={handleSignup} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Create Account</Text>}
        </Pressable>
        <View style={styles.linkRow}>
          <Text style={styles.linkCopy}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.linkText}>Login</Text>
            </Pressable>
          </Link>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background
    },
    content: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100%",
      padding: 24
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
      minHeight: 54
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700"
    },
    linkRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "center"
    },
    linkCopy: {
      color: theme.colors.muted,
      fontSize: 14
    },
    linkText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 13
    }
  });
