import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotAccounts } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotAccounts";

export function BusinessAutopilotAccountsPanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const { data, loading, error } = useBusinessAutopilotAccounts(enabled);
  const [activeTab, setActiveTab] = useState("customers");
  const styles = createStyles(theme);

  if (loading) return <Text style={styles.meta}>Loading accounts workspace...</Text>;
  if (error || !data) return <Text style={styles.error}>{error || "Unable to load accounts"}</Text>;

  const sections = [
    ["Customers", data.data.customers.length],
    ["Vendors", data.data.vendors.length],
    ["Items", data.data.itemMasters.length],
    ["GST", data.data.gstTemplates.length],
    ["Estimates", data.data.estimates.length],
    ["Invoices", data.data.invoices.length]
  ];

  const tabs = [
    { key: "customers", label: "Customers", rows: data.data.customers },
    { key: "vendors", label: "Vendors", rows: data.data.vendors },
    { key: "items", label: "Items", rows: data.data.itemMasters },
    { key: "gst", label: "GST", rows: data.data.gstTemplates },
    { key: "estimates", label: "Estimates", rows: data.data.estimates },
    { key: "invoices", label: "Invoices", rows: data.data.invoices }
  ];

  const activeRows = tabs.find((tab) => tab.key === activeTab)?.rows || [];

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{data.organization_profile.organizationName}</Text>
        <Text style={styles.meta}>
          {data.organization_profile.country} · {data.organization_profile.currency} · {data.organization_profile.timezone}
        </Text>
      </View>
      <View style={styles.grid}>
      {sections.map(([label, count]) => (
        <View key={label} style={styles.miniCard}>
          <View style={styles.row}>
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.count}>{count}</Text>
          </View>
        </View>
      ))}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{tabs.find((tab) => tab.key === activeTab)?.label}</Text>
        {activeRows.length ? activeRows.map((row: any, index: number) => (
          <View key={String(row.id || row.docNo || row.name || index)} style={styles.listCard}>
            {activeTab === "customers" ? (
              <>
                <Text style={styles.itemTitle}>{row.companyName || row.clientName || row.name || "Customer"}</Text>
                <Text style={styles.meta}>{row.clientName || row.contactPerson || "-"}</Text>
                <Text style={styles.meta}>{row.phone || row.mobile || "-"}</Text>
                <Text style={styles.meta}>{row.email || "-"}</Text>
              </>
            ) : null}

            {activeTab === "vendors" ? (
              <>
                <Text style={styles.itemTitle}>{row.vendorName || row.companyName || row.name || "Vendor"}</Text>
                <Text style={styles.meta}>{row.phone || row.mobile || "-"}</Text>
                <Text style={styles.meta}>{row.email || "-"}</Text>
                <Text style={styles.meta}>{row.gstin || row.taxId || "-"}</Text>
              </>
            ) : null}

            {activeTab === "items" ? (
              <>
                <Text style={styles.itemTitle}>{row.itemName || row.name || row.title || "Item"}</Text>
                <Text style={styles.meta}>{row.category || row.hsnCode || "-"}</Text>
                <Text style={styles.meta}>Price: {row.salePrice || row.price || row.rate || "-"}</Text>
                <Text style={styles.meta}>Status: {row.status || "Active"}</Text>
              </>
            ) : null}

            {activeTab === "gst" ? (
              <>
                <Text style={styles.itemTitle}>{row.name || "GST Template"}</Text>
                <Text style={styles.meta}>{row.taxScope || "-"}</Text>
                <Text style={styles.meta}>CGST {row.cgst || 0}% · SGST {row.sgst || 0}% · IGST {row.igst || 0}%</Text>
                <Text style={styles.meta}>{row.status || "Active"}</Text>
              </>
            ) : null}

            {activeTab === "estimates" ? (
              <>
                <Text style={styles.itemTitle}>{row.docNo || row.estimateNumber || "Estimate"}</Text>
                <Text style={styles.meta}>{row.customerName || row.clientName || "-"}</Text>
                <Text style={styles.meta}>Date: {row.date || row.estimateDate || "-"}</Text>
                <Text style={styles.meta}>Amount: {row.totalAmount || row.amount || "-"}</Text>
                <Text style={styles.meta}>{row.status || "Draft"}</Text>
              </>
            ) : null}

            {activeTab === "invoices" ? (
              <>
                <Text style={styles.itemTitle}>{row.docNo || row.invoiceNumber || "Invoice"}</Text>
                <Text style={styles.meta}>{row.customerName || row.clientName || "-"}</Text>
                <Text style={styles.meta}>Date: {row.date || row.invoiceDate || "-"}</Text>
                <Text style={styles.meta}>Amount: {row.totalAmount || row.amount || "-"}</Text>
                <Text style={styles.meta}>{row.status || "Open"}</Text>
              </>
            ) : null}
          </View>
        )) : <Text style={styles.meta}>No records in this section.</Text>}
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
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
    listCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 14,
      gap: 4
    },
    miniCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexBasis: "47%",
      padding: 16,
      gap: 8
    },
    tabBar: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 8
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 40,
      minWidth: "30%",
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    tabButtonActive: {
      backgroundColor: theme.colors.primarySoft
    },
    tabText: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center"
    },
    tabTextActive: {
      color: theme.colors.primary
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      flex: 1
    },
    itemTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "800"
    },
    count: {
      color: theme.colors.primary,
      fontSize: 18,
      fontWeight: "800"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
