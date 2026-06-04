import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { apiGet } from "@/core/api/http";
import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotPayroll } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotPayroll";
import { useBusinessAutopilotUsers } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotUsers";

type AttendanceSetting = {
  enabled?: boolean;
  require_gps?: boolean;
  allow_outside_fence?: boolean;
  radius_meters?: number;
  location_name?: string;
  latitude?: number | null;
  longitude?: number | null;
};

const hrTabs = [
  { key: "employees", label: "Employees" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "payslips", label: "Payslips" },
  { key: "settings", label: "Settings" }
] as const;

function formatMoney(value: unknown, currency = "INR") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return `${currency} 0`;
  }
  return `${currency} ${amount.toLocaleString("en-IN")}`;
}

function formatDate(value: unknown) {
  const safe = String(value || "").trim();
  if (!safe) {
    return "-";
  }
  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) {
    return safe;
  }
  return parsed.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export function BusinessAutopilotHrmPanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const payroll = useBusinessAutopilotPayroll(enabled);
  const users = useBusinessAutopilotUsers(enabled);
  const [activeTab, setActiveTab] = useState<(typeof hrTabs)[number]["key"]>("employees");
  const [attendanceSetting, setAttendanceSetting] = useState<AttendanceSetting | null>(null);
  const [attendanceError, setAttendanceError] = useState("");
  const styles = createStyles(theme);

  useEffect(() => {
    if (!enabled) {
      setAttendanceSetting(null);
      setAttendanceError("");
      return;
    }
    let active = true;
    apiGet<{ setting: AttendanceSetting }>("/api/hr/attendance/geo-settings")
      .then((response) => {
        if (active) {
          setAttendanceSetting(response.setting || null);
          setAttendanceError("");
        }
      })
      .catch((error: Error) => {
        if (active) {
          setAttendanceSetting(null);
          setAttendanceError(error.message || "Unable to load attendance settings");
        }
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (payroll.loading || users.loading) {
    return <Text style={styles.meta}>Loading HRM workspace...</Text>;
  }

  if (payroll.error || users.error) {
    return <Text style={styles.error}>{payroll.error || users.error}</Text>;
  }

  const employeeDirectory = Array.isArray(payroll.data?.employee_directory) ? payroll.data?.employee_directory : [];
  const salaryStructures = Array.isArray(payroll.data?.salary_structures) ? payroll.data?.salary_structures : [];
  const payrollEntries = Array.isArray(payroll.data?.payroll_entries) ? payroll.data?.payroll_entries : [];
  const payslips = Array.isArray(payroll.data?.payslips) ? payroll.data?.payslips : [];
  const usersList = users.data?.users || [];

  const leaveSummary = useMemo(() => {
    const departments = new Set(usersList.map((row) => String(row.department_name || "").trim()).filter(Boolean));
    const roles = new Set(usersList.map((row) => String(row.employee_role_label || row.profile_role || "").trim()).filter(Boolean));
    return {
      departments: departments.size,
      roles: roles.size
    };
  }, [usersList]);

  return (
    <View style={styles.wrap}>
      <View style={styles.metricsGrid}>
        <MetricCard theme={theme} label="Employees" value={users.data?.counts.active || usersList.length} />
        <MetricCard theme={theme} label="Structures" value={salaryStructures.length} />
        <MetricCard theme={theme} label="Payroll" value={payrollEntries.length} />
        <MetricCard theme={theme} label="Payslips" value={payslips.length} />
      </View>

      <View style={styles.tabBar}>
        {hrTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "employees" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee Directory</Text>
          {usersList.map((user) => (
            <View key={String(user.id)} style={styles.card}>
              <Text style={styles.cardTitle}>{user.full_name || user.name || user.email || "Employee"}</Text>
              <Text style={styles.meta}>{user.email || "-"}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.meta}>{user.employee_role_label || user.profile_role || "-"}</Text>
                <Text style={styles.status}>{user.status || "active"}</Text>
              </View>
              <Text style={styles.meta}>{user.department_name || "No department"}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "attendance" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance Settings</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{attendanceSetting?.location_name || "Office Location"}</Text>
            <Text style={styles.meta}>Geo attendance: {attendanceSetting?.enabled ? "Enabled" : "Disabled"}</Text>
            <Text style={styles.meta}>Require GPS: {attendanceSetting?.require_gps ? "Yes" : "No"}</Text>
            <Text style={styles.meta}>Outside fence allowed: {attendanceSetting?.allow_outside_fence ? "Yes" : "No"}</Text>
            <Text style={styles.meta}>Radius: {attendanceSetting?.radius_meters || 0} meters</Text>
            <Text style={styles.meta}>
              Coordinates: {attendanceSetting?.latitude ?? "-"}, {attendanceSetting?.longitude ?? "-"}
            </Text>
            {attendanceError ? <Text style={styles.error}>{attendanceError}</Text> : null}
          </View>
          <Text style={styles.sectionTitle}>HR Coverage</Text>
          <View style={styles.metricsGrid}>
            <MetricCard theme={theme} label="Departments" value={leaveSummary.departments} />
            <MetricCard theme={theme} label="Roles" value={leaveSummary.roles} />
            <MetricCard theme={theme} label="Users" value={users.data?.counts.all || usersList.length} />
            <MetricCard theme={theme} label="Active" value={users.data?.counts.active || 0} />
          </View>
        </View>
      ) : null}

      {activeTab === "payroll" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payroll Entries</Text>
          {payrollEntries.map((entry: any, index) => (
            <View key={String(entry.id || entry.payroll_entry_id || index)} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.employee_name || entry.employee || "Employee"}</Text>
              <Text style={styles.meta}>Month: {entry.payroll_month || entry.month || "-"}</Text>
              <Text style={styles.meta}>Gross: {formatMoney(entry.gross_salary, entry.currency || "INR")}</Text>
              <Text style={styles.meta}>Deductions: {formatMoney(entry.total_deductions, entry.currency || "INR")}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.status}>Net: {formatMoney(entry.net_salary, entry.currency || "INR")}</Text>
                <Text style={styles.meta}>{entry.status || "processed"}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "payslips" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payslips</Text>
          {payslips.map((entry: any, index) => (
            <View key={String(entry.id || entry.slip_number || index)} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.employee_name || "Employee"}</Text>
              <Text style={styles.meta}>Slip: {entry.slip_number || "-"}</Text>
              <Text style={styles.meta}>Month: {entry.generated_for_month || entry.month || "-"}</Text>
              <Text style={styles.meta}>Created: {formatDate(entry.created_at || entry.generated_at)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "settings" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HRM Settings</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{payroll.data?.organization_profile.organizationName || "Organization"}</Text>
            <Text style={styles.meta}>{payroll.data?.organization_profile.country || "-"} · {payroll.data?.organization_profile.currency || "INR"}</Text>
            <Text style={styles.meta}>{payroll.data?.organization_profile.timezone || "-"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Permissions</Text>
            <Text style={styles.meta}>Manage payroll: {payroll.data?.permissions.can_manage_payroll ? "Yes" : "No"}</Text>
            <Text style={styles.meta}>View all payroll: {payroll.data?.permissions.can_view_all_payroll ? "Yes" : "No"}</Text>
            <Text style={styles.meta}>View salary history: {payroll.data?.permissions.can_view_salary_history ? "Yes" : "No"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Salary Structures</Text>
            {salaryStructures.length ? (
              salaryStructures.slice(0, 6).map((row: any, index) => (
                <Text key={String(row.id || index)} style={styles.meta}>
                  {(row.structure_name || row.name || `Structure ${index + 1}`)} · {formatMoney(row.monthly_salary_amount || row.gross_salary || 0, payroll.data?.organization_profile.currency || "INR")}
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>No salary structures yet.</Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Employee Directory Sync</Text>
            {employeeDirectory.length ? (
              employeeDirectory.slice(0, 8).map((row: any, index) => (
                <Text key={String(row.id || row.user_id || index)} style={styles.meta}>
                  {row.employee_name || row.name || row.full_name || "Employee"} · {row.department || row.department_name || "No department"}
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>Employee directory is empty.</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MetricCard({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useThemeTokens> }) {
  return (
    <View style={[metricStyles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[metricStyles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[metricStyles.label, { color: theme.colors.muted }]}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    gap: 6,
    padding: 16
  },
  value: {
    fontSize: 24,
    fontWeight: "800"
  },
  label: {
    fontSize: 13
  }
});

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 14
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
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
    section: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 16
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      padding: 14
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "800"
    },
    infoRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 18
    },
    status: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
