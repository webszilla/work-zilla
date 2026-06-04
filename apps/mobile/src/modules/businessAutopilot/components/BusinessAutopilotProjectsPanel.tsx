import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import { useBusinessAutopilotProjects } from "@/modules/businessAutopilot/hooks/useBusinessAutopilotProjects";

const projectTabs = [
  { key: "projects", label: "Projects" },
  { key: "tasks", label: "Tasks" },
  { key: "milestones", label: "Milestones" },
  { key: "team", label: "Team" }
] as const;

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

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "INR 0";
  }
  return `INR ${amount.toLocaleString("en-IN")}`;
}

export function BusinessAutopilotProjectsPanel({ enabled }: { enabled: boolean }) {
  const theme = useThemeTokens();
  const { data, loading, error } = useBusinessAutopilotProjects(enabled);
  const [activeTab, setActiveTab] = useState<(typeof projectTabs)[number]["key"]>("projects");
  const styles = createStyles(theme);

  if (loading) {
    return <Text style={styles.meta}>Loading projects workspace...</Text>;
  }

  if (error || !data) {
    return <Text style={styles.error}>{error || "Unable to load projects"}</Text>;
  }

  const derivedTeams = useMemo(() => {
    if (Array.isArray(data.projectTeams) && data.projectTeams.length) {
      return data.projectTeams;
    }

    const items = Object.values(data.projectDetails || {}).flatMap((detail: any, index) =>
      (detail.teams || []).map((teamName: string, teamIndex: number) => ({
        id: `${detail.projectId || index}_${teamIndex}`,
        name: teamName,
        members: Array.isArray(detail.employees) ? detail.employees : [],
        departments: []
      }))
    );

    const seen = new Map<string, { id: string; name: string; members: string[]; departments: string[] }>();
    for (const item of items) {
      const existing = seen.get(item.name);
      if (existing) {
        existing.members = Array.from(new Set([...existing.members, ...item.members]));
      } else {
        seen.set(item.name, item);
      }
    }
    return Array.from(seen.values());
  }, [data.projectDetails, data.projectTeams]);

  return (
    <View style={styles.wrap}>
      <View style={styles.metricsGrid}>
        <MetricCard theme={theme} label="Projects" value={data.projects.length} />
        <MetricCard theme={theme} label="Tasks" value={data.tasks.length} />
        <MetricCard theme={theme} label="Milestones" value={data.milestones.length} />
        <MetricCard theme={theme} label="Teams" value={derivedTeams.length} />
      </View>

      <View style={styles.tabBar}>
        {projectTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "projects" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Projects</Text>
          {data.projects.map((project) => {
            const detail = data.projectDetails?.[project.id];
            return (
              <View key={project.id} style={styles.card}>
                <Text style={styles.cardTitle}>{project.name}</Text>
                <Text style={styles.meta}>{project.clientCompany || "No client assigned"}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.meta}>Start: {formatDate(project.startDate)}</Text>
                  <Text style={styles.status}>{project.status || "New"}</Text>
                </View>
                <Text style={styles.meta}>Completed: {formatDate(project.completedDate)}</Text>
                <Text style={styles.meta}>Teams: {detail?.teams?.join(", ") || "-"}</Text>
                <Text style={styles.meta}>Members: {detail?.employees?.join(", ") || "-"}</Text>
                {detail?.projectValueEnabled ? <Text style={styles.meta}>Project Value: {formatMoney(detail.projectValue)}</Text> : null}
                {detail?.notes ? <Text style={styles.meta}>{detail.notes}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {activeTab === "tasks" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tasks</Text>
          {data.tasks.map((task) => (
            <View key={task.id} style={styles.card}>
              <Text style={styles.cardTitle}>{task.title}</Text>
              <Text style={styles.meta}>Assign To: {task.assignee || "-"}</Text>
              <Text style={styles.meta}>Start: {formatDate(task.startDate)}</Text>
              <Text style={styles.meta}>Due: {formatDate(task.dueDate)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "milestones" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Milestones</Text>
          {data.milestones.map((milestone) => (
            <View key={milestone.id} style={styles.card}>
              <Text style={styles.cardTitle}>{milestone.title}</Text>
              <Text style={styles.meta}>Project: {milestone.project || "-"}</Text>
              <Text style={styles.meta}>Target Date: {formatDate(milestone.targetDate)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "team" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Teams</Text>
          {derivedTeams.map((team) => (
            <View key={team.id} style={styles.card}>
              <Text style={styles.cardTitle}>{team.name}</Text>
              <Text style={styles.meta}>Members: {team.members.length ? team.members.join(", ") : "-"}</Text>
              <Text style={styles.meta}>Departments: {team.departments.length ? team.departments.join(", ") : "-"}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Expense Snapshot</Text>
          {Object.values(data.projectDetails || {}).flatMap((detail: any) => detail.expenses || []).slice(0, 8).map((expense: any) => (
            <View key={expense.id} style={styles.card}>
              <Text style={styles.cardTitle}>{expense.title}</Text>
              <Text style={styles.meta}>{expense.category || "-"}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.meta}>{formatDate(expense.date)}</Text>
                <Text style={styles.status}>{formatMoney(expense.amount)}</Text>
              </View>
              <Text style={styles.meta}>Payee: {expense.payee || "-"}</Text>
              {expense.notes ? <Text style={styles.meta}>{expense.notes}</Text> : null}
            </View>
          ))}
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
      minWidth: "22%",
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
