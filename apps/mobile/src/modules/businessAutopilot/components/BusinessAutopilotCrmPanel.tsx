import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useThemeTokens } from "@/core/theme/useThemeTokens";
import {
  CrmChartItem,
  CrmContact,
  createCrmRecord,
  deleteCrmRecord,
  CrmDeal,
  CrmLead,
  CrmLeadDetailRow,
  CrmMeeting,
  CrmReportGroupRow,
  CrmSalesOrder,
  SupportedCrmSection,
  updateCrmRecord,
  useBusinessAutopilotCrm
} from "@/modules/businessAutopilot/hooks/useBusinessAutopilotCrm";

type Props = {
  enabled: boolean;
  onBack?: () => void;
};

const sectionTabs = [
  { key: "leads", label: "Leads", icon: "person-add-outline" },
  { key: "contacts", label: "Contacts", icon: "people-outline" },
  { key: "teams", label: "Teams", icon: "people-circle-outline" },
  { key: "deals", label: "Deals", icon: "cash-outline" },
  { key: "salesOrders", label: "Sales Orders", icon: "receipt-outline" },
  { key: "followUps", label: "Follow-ups", icon: "call-outline" },
  { key: "meetings", label: "Meetings", icon: "calendar-outline" },
  { key: "reports", label: "Reports", icon: "stats-chart-outline" }
] as const;

export function BusinessAutopilotCrmPanel({ enabled, onBack }: Props) {
  const theme = useThemeTokens();
  const styles = createStyles(theme);
  const { data, loading, error, refetch } = useBusinessAutopilotCrm(enabled);
  const [activeSection, setActiveSection] = useState<(typeof sectionTabs)[number]["key"]>("leads");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const followUps = useMemo(() => (
    (data?.meetings || []).map((meeting) => ({
      id: meeting.id,
      subject: meeting.title,
      related_to: meeting.related_to,
      due_date: meeting.meeting_date,
      owner: meeting.owner,
      status: normalizeFollowUpStatus(meeting.status)
    }))
  ), [data?.meetings]);

  const teamRows = data?.teamReport?.group_rows || [];
  const reportSummary = data?.userReport?.summary || {};

  if (loading) {
    return <Text style={styles.meta}>Loading CRM workspace...</Text>;
  }

  if (error || !data) {
    return <Text style={styles.error}>{error || "Unable to load CRM workspace"}</Text>;
  }

  const leads = data.leads.filter((row) => !isDeleted(row));
  const contacts = data.contacts.filter((row) => !isDeleted(row));
  const deals = data.deals.filter((row) => !isDeleted(row));
  const meetings = data.meetings.filter((row) => !isDeleted(row));
  const salesOrders = data.salesOrders.filter((row) => !isDeleted(row));
  const crudSection = isCrudSection(activeSection) ? activeSection : null;
  const currentRows = getCurrentRows(activeSection, { leads, contacts, deals, meetings, salesOrders, followUps, teamRows });
  const formFields = crudSection ? sectionFields[crudSection] : [];
  const formTitle = editingId ? `Edit ${sectionTitleMap[activeSection] || "Record"}` : `Create ${sectionTitleMap[activeSection] || "Record"}`;

  const resetForm = () => {
    setEditingId(null);
    setFormValues({});
    setActionError("");
  };

  const openCreate = () => {
    if (!crudSection) {
      return;
    }
    setEditingId(null);
    setFormValues(buildInitialFormValues(crudSection));
    setActionError("");
  };

  const openEdit = (row: Record<string, unknown>) => {
    if (!crudSection) {
      return;
    }
    setEditingId(Number(row.id || 0));
    setFormValues(buildInitialFormValues(crudSection, row));
    setActionError("");
  };

  const saveRecord = async () => {
    if (!crudSection) {
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const payload = buildPayload(crudSection, formValues);
      if (editingId) {
        await updateCrmRecord(crudSection, editingId, payload);
      } else {
        await createCrmRecord(crudSection, payload);
      }
      resetForm();
      refetch();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Unable to save record");
    } finally {
      setSubmitting(false);
    }
  };

  const removeRecord = async (id: number) => {
    if (!crudSection) {
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      await deleteCrmRecord(crudSection, id);
      if (editingId === id) {
        resetForm();
      }
      refetch();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to delete record");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Business Autopilot</Text>
            <Text style={styles.title}>CRM Workspace</Text>
            <Text style={styles.meta}>All CRM sections are converted into mobile cards and compact menu views.</Text>
          </View>
          {onBack ? (
            <Pressable style={styles.backButton} onPress={onBack}>
              <Ionicons name="arrow-back-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.backText}>Modules</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.sectionNav}>
        {sectionTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.sectionNavButton, activeSection === tab.key ? styles.sectionNavButtonActive : null]}
            onPress={() => setActiveSection(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeSection === tab.key ? theme.colors.primary : theme.colors.muted}
            />
            <Text style={[styles.sectionNavText, activeSection === tab.key ? styles.sectionNavTextActive : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.summaryGrid}>
        <StatCard label="Leads" value={leads.length} theme={theme} />
        <StatCard label="Contacts" value={contacts.length} theme={theme} />
        <StatCard label="Deals" value={deals.length} theme={theme} />
        <StatCard label="Sales Orders" value={salesOrders.length} theme={theme} />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.subTitle}>{sectionTitleMap[activeSection] || "Workspace"} Actions</Text>
          {crudSection ? (
            <Pressable style={styles.actionButtonPrimary} onPress={openCreate}>
              <Ionicons name="add-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.actionButtonPrimaryText}>Create</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>View only</Text>
          )}
        </View>
        {crudSection ? (
          <>
            <Text style={styles.meta}>Create, edit, and delete options are now available for this CRM section.</Text>
            {(editingId !== null || Object.keys(formValues).length > 0) ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>{formTitle}</Text>
                {formFields.map((field) => (
                  <View key={field.key} style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      placeholderTextColor={theme.colors.muted}
                      style={styles.input}
                      value={formValues[field.key] || ""}
                      onChangeText={(value) => setFormValues((current) => ({ ...current, [field.key]: value }))}
                    />
                  </View>
                ))}
                {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
                <View style={styles.formActions}>
                  <Pressable style={styles.formButton} onPress={resetForm}>
                    <Text style={styles.formButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.formButtonPrimary} onPress={saveRecord} disabled={submitting}>
                    {submitting ? <ActivityIndicator color={theme.colors.primary} size="small" /> : <Text style={styles.formButtonPrimaryText}>Save</Text>}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>Teams, Follow-ups, and Reports are view-first in mobile right now.</Text>
        )}
      </View>

      {activeSection === "leads" ? <LeadsSection rows={leads} theme={theme} onEdit={openEdit} onDelete={removeRecord} /> : null}
      {activeSection === "contacts" ? <ContactsSection rows={contacts} theme={theme} onEdit={openEdit} onDelete={removeRecord} /> : null}
      {activeSection === "teams" ? <TeamsSection rows={teamRows} theme={theme} /> : null}
      {activeSection === "deals" ? <DealsSection rows={deals} theme={theme} onEdit={openEdit} onDelete={removeRecord} /> : null}
      {activeSection === "salesOrders" ? <SalesOrdersSection rows={salesOrders} theme={theme} onEdit={openEdit} onDelete={removeRecord} /> : null}
      {activeSection === "followUps" ? <FollowUpsSection rows={followUps} theme={theme} /> : null}
      {activeSection === "meetings" ? <MeetingsSection rows={meetings} theme={theme} onEdit={openEdit} onDelete={removeRecord} /> : null}
      {activeSection === "reports" ? (
        <ReportsSection
          summary={reportSummary}
          chartItems={data.userReport?.chart_items || []}
          leadDetails={data.userReport?.lead_details || []}
          teamRows={teamRows}
          theme={theme}
        />
      ) : null}
    </View>
  );
}

function LeadsSection({ rows, theme, onEdit, onDelete }: { rows: CrmLead[]; theme: ReturnType<typeof useThemeTokens>; onEdit: (row: CrmLead) => void; onDelete: (id: number) => void; }) {
  const styles = createStyles(theme);
  const openCount = rows.filter((row) => lower(row.status) === "open").length;
  const convertedCount = rows.filter((row) => lower(row.status) === "converted").length;
  const onholdCount = rows.filter((row) => lower(row.status) === "onhold").length;

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Leads</Text>
        <Text style={styles.meta}>{rows.length} items</Text>
      </View>
      <View style={styles.summaryGrid}>
        <StatCard label="Open" value={openCount} theme={theme} />
        <StatCard label="Converted" value={convertedCount} theme={theme} />
        <StatCard label="Onhold" value={onholdCount} theme={theme} />
        <StatCard label="Pipeline" value={rows.reduce((sum, row) => sum + Number(row.lead_amount || 0), 0)} theme={theme} currency />
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.lead_name || "-"}</Text>
            <StatusBadge label={row.status || "Open"} theme={theme} />
          </View>
          <Text style={styles.cardMeta}>{row.company || "-"}</Text>
          <KeyValue label="CRM ID" value={row.crm_reference_id || "-"} theme={theme} />
          <KeyValue label="Amount" value={formatMoney(row.lead_amount)} theme={theme} />
          <KeyValue label="Assigned" value={row.assigned_user_name || row.assigned_user_names?.join(", ") || row.assigned_team || "-"} theme={theme} />
          <KeyValue label="Priority" value={row.priority || "-"} theme={theme} />
          <CrudActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row.id)} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No leads available." theme={theme} /> : null}
    </View>
  );
}

function ContactsSection({ rows, theme, onEdit, onDelete }: { rows: CrmContact[]; theme: ReturnType<typeof useThemeTokens>; onEdit: (row: CrmContact) => void; onDelete: (id: number) => void; }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Contacts</Text>
        <Text style={styles.meta}>{rows.length} items</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.name || "-"}</Text>
            <StatusBadge label={row.tag || "Client"} theme={theme} neutral />
          </View>
          <Text style={styles.cardMeta}>{row.company || "-"}</Text>
          <KeyValue label="Email" value={row.email || "-"} theme={theme} />
          <KeyValue label="Phone" value={[row.phone_country_code, row.phone].filter(Boolean).join(" ") || "-"} theme={theme} />
          <CrudActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row.id)} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No contacts available." theme={theme} /> : null}
    </View>
  );
}

function TeamsSection({ rows, theme }: { rows: CrmReportGroupRow[]; theme: ReturnType<typeof useThemeTokens> }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Teams</Text>
        <Text style={styles.meta}>{rows.length} teams</Text>
      </View>
      {rows.map((row) => (
        <View key={row.group_name} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.group_name || "Team"}</Text>
            <StatusBadge label={`${row.total_leads || 0} leads`} theme={theme} neutral />
          </View>
          <CompactMetricRow
            values={[
              ["Pending", String(row.pending_leads || 0)],
              ["Completed", String(row.completed_leads || 0)],
              ["Orders", String(row.sales_orders || 0)],
              ["Invoices", String(row.invoice_converted || 0)]
            ]}
            theme={theme}
          />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No team performance rows available." theme={theme} /> : null}
    </View>
  );
}

function DealsSection({ rows, theme, onEdit, onDelete }: { rows: CrmDeal[]; theme: ReturnType<typeof useThemeTokens>; onEdit: (row: CrmDeal) => void; onDelete: (id: number) => void; }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Deals</Text>
        <Text style={styles.meta}>{rows.length} deals</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.deal_name || "-"}</Text>
            <StatusBadge label={row.status || "Open"} theme={theme} />
          </View>
          <Text style={styles.cardMeta}>{row.company || "-"}</Text>
          <KeyValue label="CRM ID" value={row.crm_reference_id || "-"} theme={theme} />
          <KeyValue label="Deal Value" value={formatMoney(row.deal_value)} theme={theme} />
          <KeyValue label="Won Amount" value={formatMoney(row.won_amount_final)} theme={theme} />
          <KeyValue label="Stage" value={row.stage || "-"} theme={theme} />
          <KeyValue label="Assigned" value={row.assigned_user_name || row.assigned_team || "-"} theme={theme} />
          <CrudActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row.id)} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No deals available." theme={theme} /> : null}
    </View>
  );
}

function SalesOrdersSection({ rows, theme, onEdit, onDelete }: { rows: CrmSalesOrder[]; theme: ReturnType<typeof useThemeTokens>; onEdit: (row: CrmSalesOrder) => void; onDelete: (id: number) => void; }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sales Orders</Text>
        <Text style={styles.meta}>{rows.length} orders</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.customer_name || row.company || "-"}</Text>
            <StatusBadge label={row.status || "Pending"} theme={theme} />
          </View>
          <Text style={styles.cardMeta}>Order ID: {row.order_id || "-"}</Text>
          <KeyValue label="CRM ID" value={row.crm_reference_id || "-"} theme={theme} />
          <KeyValue label="Amount" value={formatMoney(row.grand_total || row.amount)} theme={theme} />
          <KeyValue label="Balance" value={formatMoney(row.balance_amount)} theme={theme} />
          <KeyValue label="Payment" value={row.payment_status || "-"} theme={theme} />
          <KeyValue label="Issue Date" value={row.issue_date || "-"} theme={theme} />
          <CrudActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row.id)} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No sales orders available." theme={theme} /> : null}
    </View>
  );
}

function FollowUpsSection({ rows, theme }: { rows: Array<{ id: number; subject: string; related_to: string; due_date: string; owner: string; status: string }>; theme: ReturnType<typeof useThemeTokens> }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Follow-ups</Text>
        <Text style={styles.meta}>{rows.length} follow-ups</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.subject || "-"}</Text>
            <StatusBadge label={row.status || "Pending"} theme={theme} />
          </View>
          <KeyValue label="Related To" value={row.related_to || "-"} theme={theme} />
          <KeyValue label="Due Date" value={row.due_date || "-"} theme={theme} />
          <KeyValue label="Owner" value={row.owner || "-"} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No follow-ups available." theme={theme} /> : null}
    </View>
  );
}

function MeetingsSection({ rows, theme, onEdit, onDelete }: { rows: CrmMeeting[]; theme: ReturnType<typeof useThemeTokens>; onEdit: (row: CrmMeeting) => void; onDelete: (id: number) => void; }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Meetings</Text>
        <Text style={styles.meta}>{rows.length} meetings</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{row.title || "-"}</Text>
            <StatusBadge label={row.status || "Scheduled"} theme={theme} />
          </View>
          <Text style={styles.cardMeta}>{row.company_or_client_name || row.related_to || "-"}</Text>
          <KeyValue label="Related To" value={row.related_to || "-"} theme={theme} />
          <KeyValue label="Date" value={[row.meeting_date, row.meeting_time].filter(Boolean).join(" · ") || "-"} theme={theme} />
          <KeyValue label="Owner" value={row.owner || "-"} theme={theme} />
          <KeyValue label="Reminder" value={row.reminder_summary || row.meeting_mode || "-"} theme={theme} />
          <CrudActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row.id)} theme={theme} />
        </View>
      ))}
      {!rows.length ? <EmptyState label="No meetings available." theme={theme} /> : null}
    </View>
  );
}

function ReportsSection({
  summary,
  chartItems,
  leadDetails,
  teamRows,
  theme
}: {
  summary: Partial<{ total_leads: number; new_leads: number; pending_leads: number; sales_orders: number; converted_estimates: number; converted_invoices: number; pipeline_value: number; won_amount: number }>;
  chartItems: CrmChartItem[];
  leadDetails: CrmLeadDetailRow[];
  teamRows: CrmReportGroupRow[];
  theme: ReturnType<typeof useThemeTokens>;
}) {
  const styles = createStyles(theme);
  const metrics: Array<[string, number]> = [
    ["Total Leads", summary.total_leads || 0],
    ["New Leads", summary.new_leads || 0],
    ["Pending", summary.pending_leads || 0],
    ["Sales Orders", summary.sales_orders || 0],
    ["Estimates", summary.converted_estimates || 0],
    ["Invoices", summary.converted_invoices || 0],
    ["Pipeline", summary.pipeline_value || 0],
    ["Won Amount", summary.won_amount || 0]
  ];

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Reports</Text>
        <Text style={styles.meta}>CRM performance snapshot</Text>
      </View>
      <View style={styles.summaryGrid}>
        {metrics.map(([label, value]) => (
          <StatCard key={label} label={label} value={Number(value || 0)} theme={theme} currency={label === "Pipeline" || label === "Won Amount"} />
        ))}
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.subTitle}>Performance Snapshot</Text>
        {chartItems.slice(0, 6).map((item) => (
          <View key={item.label} style={styles.metricRow}>
            <Text style={styles.metricLabel}>{item.label}</Text>
            <Text style={styles.metricValue}>{item.value}</Text>
          </View>
        ))}
        {!chartItems.length ? <EmptyState label="No report chart data available." theme={theme} compact /> : null}
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.subTitle}>Team Performance</Text>
        {teamRows.slice(0, 8).map((row) => (
          <View key={row.group_name} style={styles.tableCard}>
            <Text style={styles.cardTitle}>{row.group_name || "Team"}</Text>
            <CompactMetricRow
              values={[
                ["Total", String(row.total_leads || 0)],
                ["Pending", String(row.pending_leads || 0)],
                ["SO", String(row.sales_orders || 0)],
                ["Inv", String(row.invoice_converted || 0)]
              ]}
              theme={theme}
            />
          </View>
        ))}
        {!teamRows.length ? <EmptyState label="No team report rows available." theme={theme} compact /> : null}
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.subTitle}>Lead Details</Text>
        {leadDetails.slice(0, 12).map((row, index) => (
          <View key={`${row.crm_reference_id}-${index}`} style={styles.tableCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{row.lead_name || "-"}</Text>
              <StatusBadge label={row.status || "-"} theme={theme} />
            </View>
            <KeyValue label="CRM ID" value={row.crm_reference_id || "-"} theme={theme} />
            <KeyValue label="Company" value={row.company || "-"} theme={theme} />
            <KeyValue label="Assigned" value={row.assigned_to || row.group_name || "-"} theme={theme} />
            <KeyValue label="Date" value={row.date || "-"} theme={theme} />
          </View>
        ))}
        {!leadDetails.length ? <EmptyState label="No lead detail rows available." theme={theme} compact /> : null}
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  theme,
  currency = false
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof useThemeTokens>;
  currency?: boolean;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{currency ? formatMoney(value) : compactNumber(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({
  label,
  theme,
  neutral = false
}: {
  label: string;
  theme: ReturnType<typeof useThemeTokens>;
  neutral?: boolean;
}) {
  const styles = createStyles(theme);
  return (
    <View style={[styles.badge, neutral ? styles.badgeNeutral : null]}>
      <Text style={[styles.badgeText, neutral ? styles.badgeTextNeutral : null]}>{label}</Text>
    </View>
  );
}

function KeyValue({
  label,
  value,
  theme
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useThemeTokens>;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CompactMetricRow({
  values,
  theme
}: {
  values: Array<[string, string]>;
  theme: ReturnType<typeof useThemeTokens>;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.compactRow}>
      {values.map(([label, value]) => (
        <View key={label} style={styles.compactCell}>
          <Text style={styles.compactValue}>{value}</Text>
          <Text style={styles.compactLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  label,
  theme,
  compact = false
}: {
  label: string;
  theme: ReturnType<typeof useThemeTokens>;
  compact?: boolean;
}) {
  const styles = createStyles(theme);
  return (
    <View style={[styles.emptyCard, compact ? styles.emptyCompact : null]}>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

function CrudActions({
  onEdit,
  onDelete,
  theme
}: {
  onEdit: () => void;
  onDelete: () => void;
  theme: ReturnType<typeof useThemeTokens>;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.crudRow}>
      <Pressable style={styles.actionButton} onPress={onEdit}>
        <Ionicons name="create-outline" size={14} color={theme.colors.primary} />
        <Text style={styles.actionButtonText}>Edit</Text>
      </Pressable>
      <Pressable style={styles.actionButtonDanger} onPress={onDelete}>
        <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
        <Text style={styles.actionButtonDangerText}>Delete</Text>
      </Pressable>
    </View>
  );
}

function lower(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFollowUpStatus(status: string) {
  const normalized = lower(status);
  if (normalized === "scheduled") {
    return "Pending";
  }
  if (normalized === "rescheduled") {
    return "Ongoing";
  }
  return status || "Pending";
}

function compactNumber(value: number) {
  if (value >= 100000) {
    return `${(value / 100000).toFixed(1)}L`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function formatMoney(value: number) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function isDeleted(row: { is_deleted?: boolean }) {
  return Boolean(row.is_deleted);
}

const sectionTitleMap: Record<string, string> = {
  leads: "Leads",
  contacts: "Contacts",
  teams: "Teams",
  deals: "Deals",
  salesOrders: "Sales Orders",
  followUps: "Follow-ups",
  meetings: "Meetings",
  reports: "Reports"
};

const sectionFields: Record<SupportedCrmSection, Array<{ key: string; label: string }>> = {
  leads: [
    { key: "lead_name", label: "Lead name" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "lead_amount", label: "Lead amount" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" }
  ],
  contacts: [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "tag", label: "Tag" }
  ],
  deals: [
    { key: "deal_name", label: "Deal name" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "deal_value", label: "Deal value" },
    { key: "won_amount_final", label: "Won amount" },
    { key: "stage", label: "Stage" },
    { key: "status", label: "Status" }
  ],
  meetings: [
    { key: "title", label: "Meeting title" },
    { key: "company_or_client_name", label: "Company / client" },
    { key: "related_to", label: "Related to" },
    { key: "meeting_date", label: "Meeting date YYYY-MM-DD" },
    { key: "meeting_time", label: "Meeting time HH:MM" },
    { key: "owner", label: "Owner" },
    { key: "meeting_mode", label: "Meeting mode" },
    { key: "status", label: "Status" }
  ],
  salesOrders: [
    { key: "customer_name", label: "Customer name" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "amount", label: "Amount" },
    { key: "quantity", label: "Quantity" },
    { key: "price", label: "Price" },
    { key: "tax", label: "Tax" },
    { key: "status", label: "Status" }
  ]
};

function isCrudSection(value: string): value is SupportedCrmSection {
  return value === "leads" || value === "contacts" || value === "deals" || value === "meetings" || value === "salesOrders";
}

function buildInitialFormValues(section: SupportedCrmSection, row?: Record<string, unknown>) {
  const fields = sectionFields[section];
  return Object.fromEntries(
    fields.map((field) => [field.key, String((row?.[field.key] ?? row?.[camelAlias(field.key)] ?? "") || "")])
  );
}

function camelAlias(key: string) {
  if (key === "company_or_client_name") return "companyOrClientName";
  if (key === "meeting_date") return "meetingDate";
  if (key === "meeting_time") return "meetingTime";
  return key;
}

function buildPayload(section: SupportedCrmSection, values: Record<string, string>) {
  if (section === "contacts") {
    return {
      name: values.name || "",
      company: values.company || "",
      email: values.email || "",
      phone: values.phone || "",
      tag: values.tag || "Client"
    };
  }
  if (section === "leads") {
    return {
      lead_name: values.lead_name || "",
      company: values.company || "",
      phone: values.phone || "",
      lead_amount: values.lead_amount || "0",
      status: values.status || "Open",
      priority: values.priority || "Medium"
    };
  }
  if (section === "deals") {
    return {
      deal_name: values.deal_name || "",
      company: values.company || "",
      phone: values.phone || "",
      deal_value: values.deal_value || "0",
      won_amount_final: values.won_amount_final || "0",
      stage: values.stage || "Qualified",
      status: values.status || "Open"
    };
  }
  if (section === "meetings") {
    return {
      title: values.title || "",
      company_or_client_name: values.company_or_client_name || "",
      related_to: values.related_to || "",
      meeting_date: values.meeting_date || "",
      meeting_time: values.meeting_time || "",
      owner: values.owner || "",
      meeting_mode: values.meeting_mode || "",
      status: values.status || "Scheduled"
    };
  }
  return {
    customer_name: values.customer_name || "",
    company: values.company || "",
    phone: values.phone || "",
    amount: values.amount || "0",
    quantity: values.quantity || "1",
    price: values.price || "0",
    tax: values.tax || "0",
    status: values.status || "Pending"
  };
}

function getCurrentRows(
  section: string,
  values: {
    leads: CrmLead[];
    contacts: CrmContact[];
    deals: CrmDeal[];
    meetings: CrmMeeting[];
    salesOrders: CrmSalesOrder[];
    followUps: Array<{ id: number }>;
    teamRows: CrmReportGroupRow[];
  }
) {
  if (section === "leads") return values.leads;
  if (section === "contacts") return values.contacts;
  if (section === "deals") return values.deals;
  if (section === "meetings") return values.meetings;
  if (section === "salesOrders") return values.salesOrders;
  if (section === "followUps") return values.followUps;
  if (section === "teams") return values.teamRows;
  return [];
}

const createStyles = (theme: ReturnType<typeof useThemeTokens>) =>
  StyleSheet.create({
    wrap: {
      gap: 14
    },
    headerCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16
    },
    headerRow: {
      gap: 12
    },
    headerCopy: {
      gap: 6
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase"
    },
    title: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "800"
    },
    backButton: {
      alignSelf: "flex-start",
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    backText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700"
    },
    sectionNav: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 8
    },
    sectionNavButton: {
      alignItems: "center",
      borderRadius: 8,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10
    },
    sectionNavButtonActive: {
      backgroundColor: theme.colors.primarySoft
    },
    sectionNavText: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: "700"
    },
    sectionNavTextActive: {
      color: theme.colors.primary
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12
    },
    statCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexBasis: "47%",
      gap: 6,
      padding: 14
    },
    statValue: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "800"
    },
    statLabel: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: "600"
    },
    sectionBlock: {
      gap: 12
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: "800"
    },
    subTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      gap: 10,
      padding: 16
    },
    sectionCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      gap: 12,
      padding: 16
    },
    formCard: {
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      marginTop: 12,
      padding: 14
    },
    fieldBlock: {
      gap: 6
    },
    fieldLabel: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    formTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.colors.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 11
    },
    formActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end"
    },
    formButton: {
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    formButtonText: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: "700"
    },
    formButtonPrimary: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      minWidth: 84,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    formButtonPrimaryText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center"
    },
    tableCard: {
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 14
    },
    cardHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between"
    },
    cardTitle: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 16,
      fontWeight: "800"
    },
    cardMeta: {
      color: theme.colors.muted,
      fontSize: 13
    },
    badge: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    badgeNeutral: {
      backgroundColor: theme.colors.surfaceAlt
    },
    badgeText: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "700"
    },
    badgeTextNeutral: {
      color: theme.colors.text
    },
    metricRow: {
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between"
    },
    metricLabel: {
      color: theme.colors.muted,
      flex: 1,
      fontSize: 13
    },
    metricValue: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "right"
    },
    compactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10
    },
    compactCell: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexBasis: "47%",
      gap: 4,
      padding: 10
    },
    compactValue: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    compactLabel: {
      color: theme.colors.muted,
      fontSize: 12
    },
    emptyCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      padding: 16
    },
    emptyCompact: {
      paddingHorizontal: 0,
      paddingVertical: 4,
      borderWidth: 0,
      backgroundColor: "transparent"
    },
    meta: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    crudRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4
    },
    actionButton: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9
    },
    actionButtonText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700"
    },
    actionButtonPrimary: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9
    },
    actionButtonPrimaryText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700"
    },
    actionButtonDanger: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9
    },
    actionButtonDangerText: {
      color: theme.colors.danger,
      fontSize: 12,
      fontWeight: "700"
    },
    error: {
      color: theme.colors.danger,
      fontSize: 14
    }
  });
