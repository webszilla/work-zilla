import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { apiGet, apiPost } from "@/core/api/http";
import { useAuth } from "@/core/auth/AuthContext";
import { API_BASE_URL } from "@/core/config/env";
import { DEFAULT_PRODUCT_KEY, getMobileProduct } from "@/core/products/catalog";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";

type PublicProduct = { id: number; slug: string; name: string };
type PublicProductResponse = { products: PublicProduct[] };
type PublicPlan = {
  id: number;
  code: string;
  name: string;
  price_inr_month: number;
  price_inr_year: number;
  price_usdt_month?: number;
  price_usdt_year?: number;
  allow_addons?: boolean;
  limits?: Record<string, unknown>;
  features?: Record<string, unknown>;
};
type ProductPlansResponse = {
  product: { slug: string; name: string };
  trial_days: number;
  free_eligible: boolean;
  trial_plan_id: number | null;
  plans: PublicPlan[];
};

type LoadState = {
  products: PublicProduct[];
  selectedProduct: string;
  plans: PublicPlan[];
  trialDays: number;
  freeEligible: boolean;
  loading: boolean;
  actionLoadingId: number | null;
  error: string;
  message: string;
};

export default function PlansScreen() {
  const theme = useThemeTokens();
  const { loading: authLoading, session, refreshSession } = useAuth();
  const params = useLocalSearchParams<{ fromSignup?: string }>();
  const styles = createStyles(theme);
  const [state, setState] = useState<LoadState>({
    products: [],
    selectedProduct: DEFAULT_PRODUCT_KEY,
    plans: [],
    trialDays: 15,
    freeEligible: true,
    loading: true,
    actionLoadingId: null,
    error: "",
    message: ""
  });

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }
    let active = true;
    const load = async () => {
      try {
        setState((current) => ({ ...current, loading: true, error: "", message: params.fromSignup ? "Select a plan to continue." : current.message }));
        const productData = await apiGet<PublicProductResponse>("/api/public/products");
        if (!active) return;
        const products = productData.products || [];
        const selectedProduct = products[0]?.slug || DEFAULT_PRODUCT_KEY;
        setState((current) => ({ ...current, products, selectedProduct }));
        const planData = await apiGet<ProductPlansResponse>(`/api/public/plans?product=${selectedProduct}`);
        if (!active) return;
        setState((current) => ({
          ...current,
          products,
          selectedProduct,
          plans: planData.plans || [],
          trialDays: planData.trial_days || 15,
          freeEligible: Boolean(planData.free_eligible),
          loading: false,
          error: "",
          message: params.fromSignup ? "Select a plan to continue." : ""
        }));
      } catch (error) {
        if (!active) return;
        setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Unable to load plans" }));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [params.fromSignup, session?.authenticated]);

  const loadProductPlans = async (slug: string) => {
    try {
      setState((current) => ({ ...current, selectedProduct: slug, loading: true, error: "", message: "" }));
      const planData = await apiGet<ProductPlansResponse>(`/api/public/plans?product=${slug}`);
      setState((current) => ({
        ...current,
        selectedProduct: slug,
        plans: planData.plans || [],
        trialDays: planData.trial_days || 15,
        freeEligible: Boolean(planData.free_eligible),
        loading: false,
        error: ""
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Unable to load plans" }));
    }
  };

  const activeProduct = useMemo(
    () => state.products.find((item) => item.slug === state.selectedProduct),
    [state.products, state.selectedProduct]
  );

  const handlePlanAction = async (plan: PublicPlan) => {
    const isTrialLike = Boolean((plan.features || {}).is_trial) || String(plan.name || "").toLowerCase().includes("trial") || plan.price_inr_month <= 0;
    try {
      setState((current) => ({ ...current, actionLoadingId: plan.id, error: "", message: "" }));
      if (isTrialLike) {
        const response = await apiPost<{ status: string; redirect?: string; trial_end?: string; message?: string }>("/api/subscription/start", {
          product: state.selectedProduct,
          plan_id: plan.id,
          interval: "monthly"
        });
        await refreshSession();
        setState((current) => ({
          ...current,
          actionLoadingId: null,
          message: response.trial_end ? `Trial started. Ends on ${new Date(response.trial_end).toLocaleDateString()}.` : (response.message || "Trial started successfully.")
        }));
        return;
      }
      const response = await apiPost<{ ok: boolean; redirect: string; message?: string }>("/api/subscription/checkout-select", {
        product_slug: state.selectedProduct,
        plan_id: plan.id,
        billing: "monthly",
        currency: "inr"
      });
      if (response.redirect) {
        await Linking.openURL(`${API_BASE_URL}${response.redirect}`);
      }
      setState((current) => ({ ...current, actionLoadingId: null }));
    } catch (error) {
      setState((current) => ({
        ...current,
        actionLoadingId: null,
        error: error instanceof Error ? error.message : "Unable to continue"
      }));
    }
  };

  if (!authLoading && !session?.authenticated) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Pricing</Text>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.copy}>{getMobileProduct(state.selectedProduct)?.planHint || "Choose a product and continue with its plan."}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productTabs}>
        {state.products.map((product) => {
          const active = product.slug === state.selectedProduct;
          return (
            <Pressable key={product.slug} style={[styles.productTab, active && styles.productTabActive]} onPress={() => void loadProductPlans(product.slug)}>
              <Text style={[styles.productTabText, active && styles.productTabTextActive]}>{product.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {state.loading ? (
        <View style={styles.card}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{activeProduct?.name || "Plans"}</Text>
            <Text style={styles.infoMeta}>{state.freeEligible ? `${state.trialDays} day free trial available` : "Free trial not available for this product"}</Text>
          </View>
          {state.message ? <Text style={styles.success}>{state.message}</Text> : null}
          {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
          {state.plans.map((plan) => {
            const isTrialLike = Boolean((plan.features || {}).is_trial) || String(plan.name || "").toLowerCase().includes("trial") || plan.price_inr_month <= 0;
            return (
              <View key={`${state.selectedProduct}-${plan.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderCopy}>
                    <Text style={styles.cardTitle}>{plan.name}</Text>
                    <Text style={styles.meta}>{isTrialLike ? `${state.trialDays} day free trial` : "Paid plan"}</Text>
                  </View>
                  <View style={styles.priceWrap}>
                    <Text style={styles.price}>₹{Number(plan.price_inr_month || 0).toLocaleString("en-IN")}</Text>
                    <Text style={styles.priceMeta}>/ month</Text>
                  </View>
                </View>
                <View style={styles.featureList}>
                  {Object.entries(plan.limits || {}).slice(0, 5).map(([key, value]) => (
                    <View key={key} style={styles.featureRow}>
                      <Text style={styles.featureLabel}>{key.replace(/_/g, " ")}</Text>
                      <Text style={styles.featureValue}>{String(value ?? "-")}</Text>
                    </View>
                  ))}
                </View>
                <Pressable style={styles.primaryButton} onPress={() => void handlePlanAction(plan)} disabled={state.actionLoadingId === plan.id}>
                  {state.actionLoadingId === plan.id ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{isTrialLike ? "Start Free Trial" : "Process to Pay"}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, gap: 16 },
    headerBlock: { gap: 4 },
    eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
    title: { color: theme.colors.text, fontSize: 24, fontWeight: "800" },
    copy: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
    productTabs: { gap: 10 },
    productTab: {
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface
    },
    productTabActive: { backgroundColor: theme.colors.primary },
    productTabText: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    productTabTextActive: { color: "#ffffff" },
    infoCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 4
    },
    infoTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
    infoMeta: { color: theme.colors.muted, fontSize: 14 },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      gap: 12
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    cardHeaderCopy: { flex: 1, gap: 4 },
    cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
    meta: { color: theme.colors.muted, fontSize: 13 },
    priceWrap: { alignItems: "flex-end" },
    price: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
    priceMeta: { color: theme.colors.muted, fontSize: 12 },
    featureList: { gap: 8 },
    featureRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    featureLabel: { color: theme.colors.muted, fontSize: 13, textTransform: "capitalize", flex: 1 },
    featureValue: { color: theme.colors.text, fontSize: 13, fontWeight: "600", textAlign: "right" },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48
    },
    primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
    success: { color: theme.colors.primary, fontSize: 13, textAlign: "center" },
    error: { color: theme.colors.danger, fontSize: 13, textAlign: "center" }
  });
