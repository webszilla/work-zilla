import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { BusinessAutopilotAccountsPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotAccountsPanel";
import { BusinessAutopilotCrmPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotCrmPanel";
import { BusinessAutopilotDashboardPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotDashboardPanel";
import { BusinessAutopilotHrmPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotHrmPanel";
import { BusinessAutopilotModulesPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotModulesPanel";
import { BusinessAutopilotProjectsPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotProjectsPanel";
import { BusinessAutopilotProfilePanel } from "@/modules/businessAutopilot/components/BusinessAutopilotProfilePanel";
import { BusinessAutopilotUsersPanel } from "@/modules/businessAutopilot/components/BusinessAutopilotUsersPanel";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";
import { WorksuiteDashboardPanel } from "@/modules/worksuite/components/WorksuiteDashboardPanel";
import { WorksuiteEmployeesPanel } from "@/modules/worksuite/components/WorksuiteEmployeesPanel";
import { WorksuiteProfilePanel } from "@/modules/worksuite/components/WorksuiteProfilePanel";

const productDescriptions: Record<string, string> = {
  monitor: "Work Suite mobile workspace for attendance, activity, and employee monitoring.",
  worksuite: "Work Suite mobile workspace for attendance, activity, and employee monitoring.",
  "business-autopilot-erp": "Business Autopilot mobile workspace for CRM, HR, projects, accounts, and stocks.",
  storage: "Online Storage mobile workspace for organization files and folders.",
  "ai-chatbot": "AI Chatbot mobile workspace for inbox, live chat, and leads.",
  "imposition-software": "Print Marks mobile workspace for plan, license, and print operations."
};

const worksuiteTabs = [
  { key: "dashboard", label: "Dashboard", icon: "home-outline" },
  { key: "users", label: "Users", icon: "people-outline" },
  { key: "profile", label: "Profile", icon: "person-outline" }
] as const;

const businessAutopilotTabs = [
  { key: "dashboard", label: "Dashboard", icon: "home-outline" },
  { key: "modules", label: "Modules", icon: "grid-outline" },
  { key: "users", label: "Users", icon: "people-outline" },
  { key: "accounts", label: "Accounts", icon: "card-outline" },
  { key: "profile", label: "Profile", icon: "person-outline" }
] as const;

export default function ProductWorkspaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useThemeTokens();
  const styles = createStyles(theme);
  const productSlug = String(slug || "monitor");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const isWorksuite = productSlug === "monitor" || productSlug === "worksuite" || productSlug === "work-suite";
  const isBusinessAutopilot = productSlug === "business-autopilot-erp" || productSlug === "business-autopilot";

  const handleBusinessTabPress = (nextTab: string) => {
    setActiveTab(nextTab);
    if (nextTab !== "modules") {
      setActiveModule(null);
    }
  };

  const openBusinessModule = (moduleKey: string) => {
    if (["crm", "hrm", "projects"].includes(moduleKey)) {
      setActiveModule(moduleKey);
      setActiveTab("modules");
      return;
    }
    if (moduleKey === "subscriptions") {
      setActiveModule(null);
      setActiveTab("modules");
      return;
    }
    if (moduleKey === "accounts") {
      setActiveModule("accounts");
      setActiveTab("modules");
      return;
    }
    if (moduleKey === "billing") {
      setActiveModule("accounts");
      setActiveTab("accounts");
      return;
    }
    if (moduleKey === "ticketing" || moduleKey === "stocks" || moduleKey === "inventory" || moduleKey === "inbox") {
      setActiveModule(null);
      setActiveTab("dashboard");
      return;
    }
    if (moduleKey === "users") {
      setActiveModule(null);
      setActiveTab("users");
      return;
    }
    if (moduleKey === "profile") {
      setActiveModule(null);
      setActiveTab("profile");
      return;
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      {activeTab === "dashboard" ? (
        <View style={styles.heroRow}>
          <View style={styles.hero}>
            <BrandedHeader
              eyebrow="Mobile Workspace"
              title={isBusinessAutopilot ? "Business Autopilot" : productSlug}
              subtitle={productDescriptions[productSlug] || "Native mobile product workspace."}
              showBrandRow={false}
            />
          </View>
          <View style={styles.attendanceCard}>
            <Text style={styles.attendanceTitle}>My Attendance</Text>
            <View style={styles.attendanceButtons}>
              <Pressable style={styles.attendanceButtonPrimary}>
                <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                <Text style={styles.attendanceButtonPrimaryText}>In</Text>
              </Pressable>
              <Pressable style={styles.attendanceButtonSecondary}>
                <Ionicons name="log-out-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.attendanceButtonSecondaryText}>Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {isWorksuite ? (
        <>
          <View style={styles.tabBar}>
            {worksuiteTabs.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={activeTab === tab.key ? theme.colors.primary : theme.colors.muted}
                />
                <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
          {activeTab === "dashboard" ? <WorksuiteDashboardPanel enabled /> : null}
          {activeTab === "users" ? <WorksuiteEmployeesPanel enabled /> : null}
          {activeTab === "profile" ? <WorksuiteProfilePanel enabled /> : null}
        </>
      ) : isBusinessAutopilot ? (
        <>
          <View style={styles.tabBar}>
            {businessAutopilotTabs.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
                onPress={() => handleBusinessTabPress(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={activeTab === tab.key ? theme.colors.primary : theme.colors.muted}
                />
                <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
          {activeTab === "dashboard" ? <BusinessAutopilotDashboardPanel enabled onShortcutPress={openBusinessModule} /> : null}
          {activeTab === "modules" && activeModule === "crm" ? <BusinessAutopilotCrmPanel enabled onBack={() => setActiveModule(null)} /> : null}
          {activeTab === "modules" && activeModule === "hrm" ? <BusinessAutopilotHrmPanel enabled /> : null}
          {activeTab === "modules" && activeModule === "projects" ? <BusinessAutopilotProjectsPanel enabled /> : null}
          {activeTab === "modules" && activeModule === "accounts" ? <BusinessAutopilotAccountsPanel enabled /> : null}
          {activeTab === "modules" && activeModule !== "crm" && activeModule !== "hrm" && activeModule !== "projects" && activeModule !== "accounts" ? <BusinessAutopilotModulesPanel enabled onOpenModule={openBusinessModule} /> : null}
          {activeTab === "users" ? <BusinessAutopilotUsersPanel enabled /> : null}
          {activeTab === "accounts" ? <BusinessAutopilotAccountsPanel enabled /> : null}
          {activeTab === "profile" ? <BusinessAutopilotProfilePanel enabled /> : null}
        </>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Step 1</Text>
            <Text style={styles.sectionCopy}>Product shell is ready. Next, each desktop page will be converted into mobile-first cards, lists, forms, and drill-down screens.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next conversion targets</Text>
            <Text style={styles.sectionCopy}>Dashboard, users, billing, profile, tables, forms, and ticketing screens.</Text>
          </View>
        </>
      )}
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
    hero: {
      flex: 3,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 20
    },
    heroRow: {
      flexDirection: "row",
      gap: 16
    },
    attendanceCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      gap: 14,
      justifyContent: "center",
      padding: 16
    },
    attendanceTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800",
      textAlign: "center"
    },
    attendanceButtons: {
      gap: 10
    },
    attendanceButtonPrimary: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 10
    },
    attendanceButtonPrimaryText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center"
    },
    attendanceButtonSecondary: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 10
    },
    attendanceButtonSecondaryText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center"
    },
    tabBar: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexDirection: "row",
      gap: 8,
      padding: 8
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      gap: 6,
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 8,
      paddingVertical: 8
    },
    tabButtonActive: {
      backgroundColor: theme.colors.primarySoft
    },
    tabText: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center"
    },
    tabTextActive: {
      color: theme.colors.primary
    },
    section: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 18,
      gap: 8
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    sectionCopy: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    }
  });
