import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { apiGet } from "@/core/api/http";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { performAttendancePunch, type AttendanceAction, type AttendanceRecord } from "@/modules/businessAutopilot/utils/attendance";
import { AppTopHeader } from "@/modules/common/components/AppTopHeader";
import { BrandedHeader } from "@/modules/common/components/BrandedHeader";

type AttendanceRecordsResponse = {
  employee_name?: string;
  records: AttendanceRecord[];
};

function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function buildStatus(record: AttendanceRecord | undefined) {
  if (!record) return "No record";
  if (record.checkin_time && record.checkout_time) return "Completed";
  if (record.checkin_time) return "Checked In";
  return "Pending";
}

export default function AttendanceScreen() {
  const theme = useThemeTokens();
  const styles = createStyles(theme);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employeeName, setEmployeeName] = useState("Employee");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submittingAction, setSubmittingAction] = useState<AttendanceAction | "">("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiGet<AttendanceRecordsResponse>("/api/hr/attendance/my-records");
      setRecords(Array.isArray(response.records) ? response.records : []);
      setEmployeeName(String(response.employee_name || "Employee").trim() || "Employee");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load attendance records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const todayRecord = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return records.find((record) => String(record.attendance_date || "").slice(0, 10) === today);
  }, [records]);

  const handlePunch = useCallback(
    async (action: AttendanceAction) => {
      setSubmittingAction(action);
      setNotice("");
      setError("");
      try {
        const response = await performAttendancePunch(action);
        setNotice(response.message || (action === "in" ? "Check-in saved successfully." : "Check-out saved successfully."));
        await fetchRecords();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to save attendance.");
      } finally {
        setSubmittingAction("");
      }
    },
    [fetchRecords]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppTopHeader />
      <View style={styles.hero}>
        <BrandedHeader
          eyebrow="Attendance"
          title="My Attendance"
          subtitle="View daily records and punch in or out from the mobile workspace."
          showBrandRow={false}
        />
        <View style={styles.heroActions}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Employee</Text>
          <Text style={styles.summaryValue}>{employeeName}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Today Status</Text>
          <Text style={styles.summaryValue}>{buildStatus(todayRecord)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Check In</Text>
          <Text style={styles.summaryValue}>{formatTime(todayRecord?.checkin_time || null)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Check Out</Text>
          <Text style={styles.summaryValue}>{formatTime(todayRecord?.checkout_time || null)}</Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Pressable
          style={[styles.primaryAction, submittingAction ? styles.actionDisabled : null]}
          disabled={Boolean(submittingAction)}
          onPress={() => handlePunch("in")}
        >
          <Ionicons name="log-in-outline" size={16} color="#ffffff" />
          <Text style={styles.primaryActionText}>{submittingAction === "in" ? "Saving..." : "In"}</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryAction, submittingAction ? styles.actionDisabled : null]}
          disabled={Boolean(submittingAction)}
          onPress={() => handlePunch("out")}
        >
          <Ionicons name="log-out-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.secondaryActionText}>{submittingAction === "out" ? "Saving..." : "Out"}</Text>
        </Pressable>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.recordsCard}>
        <Text style={styles.recordsTitle}>Attendance Records</Text>
        {loading ? <Text style={styles.meta}>Loading attendance records...</Text> : null}
        {!loading && !records.length ? <Text style={styles.meta}>No attendance records found.</Text> : null}
        {!loading
          ? records.map((record) => (
              <View key={String(record.id)} style={styles.recordRow}>
                <View style={styles.recordMain}>
                  <Text style={styles.recordDate}>{formatDate(record.attendance_date)}</Text>
                  <Text style={styles.recordMeta}>
                    In: {formatTime(record.checkin_time)} · Out: {formatTime(record.checkout_time)}
                  </Text>
                </View>
                <View style={styles.recordSide}>
                  <Text style={styles.recordStatus}>{buildStatus(record)}</Text>
                  <Text style={styles.recordGeo}>{String(record.geo_status || "MANUAL").replaceAll("_", " ")}</Text>
                </View>
              </View>
            ))
          : null}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      gap: 16,
    },
    hero: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    heroActions: {
      alignItems: "flex-start",
    },
    backButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    backButtonText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      minWidth: 180,
      padding: 16,
    },
    summaryLabel: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    summaryValue: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    actionsCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    primaryAction: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    primaryActionText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },
    secondaryAction: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    secondaryActionText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
    },
    actionDisabled: {
      opacity: 0.6,
    },
    notice: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "600",
    },
    error: {
      color: "#dc2626",
      fontSize: 12,
      fontWeight: "600",
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13,
    },
    recordsCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    recordsTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    recordRow: {
      alignItems: "center",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    recordMain: {
      flex: 1,
      gap: 4,
    },
    recordDate: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    recordMeta: {
      color: theme.colors.muted,
      fontSize: 13,
    },
    recordSide: {
      alignItems: "flex-end",
      gap: 4,
    },
    recordStatus: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    recordGeo: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
    },
  });
