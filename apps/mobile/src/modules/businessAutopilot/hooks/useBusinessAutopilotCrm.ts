import { useEffect, useState } from "react";

import { apiGet, apiPost } from "@/core/api/http";

export type CrmLead = {
  id: number;
  crm_reference_id: string;
  lead_name: string;
  company: string;
  phone: string;
  lead_amount: number;
  lead_source: string;
  assign_type: string;
  assigned_user_name: string;
  assigned_user_names: string[];
  assigned_team: string;
  stage: string;
  priority: string;
  status: string;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmContact = {
  id: number;
  name: string;
  company: string;
  email: string;
  phone_country_code: string;
  phone: string;
  tag: string;
  is_deleted?: boolean;
  created_at: string;
};

export type CrmDeal = {
  id: number;
  crm_reference_id: string;
  deal_name: string;
  company: string;
  phone: string;
  deal_value: number;
  won_amount_final: number;
  stage: string;
  status: string;
  assigned_user_name: string;
  assigned_team: string;
  is_deleted?: boolean;
  created_at: string;
};

export type CrmMeeting = {
  id: number;
  crm_reference_id: string;
  title: string;
  company_or_client_name: string;
  related_to: string;
  meeting_date: string;
  meeting_time: string;
  owner: string;
  meeting_mode: string;
  reminder_summary: string;
  status: string;
  is_deleted?: boolean;
  created_at: string;
};

export type CrmSalesOrder = {
  id: number;
  crm_reference_id: string;
  order_id: string;
  customer_name: string;
  company: string;
  phone: string;
  amount: number;
  grand_total: number;
  balance_amount: number;
  issue_date: string;
  due_date: string;
  status: string;
  payment_status: string;
  assigned_user_name: string;
  is_deleted?: boolean;
  created_at: string;
};

export type CrmReportSummary = {
  total_leads: number;
  new_leads: number;
  pending_leads: number;
  sales_orders: number;
  converted_estimates: number;
  converted_invoices: number;
  pipeline_value: number;
  won_amount: number;
};

export type CrmReportGroupRow = {
  group_name: string;
  total_leads: number;
  pending_leads: number;
  completed_leads: number;
  sales_orders: number;
  estimate_converted: number;
  invoice_converted: number;
};

export type CrmLeadDetailRow = {
  date: string;
  crm_reference_id: string;
  lead_name: string;
  company: string;
  status: string;
  assigned_to: string;
  group_name: string;
};

export type CrmChartItem = {
  label: string;
  value: number;
};

export type CrmReport = {
  summary: Partial<CrmReportSummary>;
  period: {
    from_date: string;
    to_date: string;
  };
  group_by: string;
  group_rows: CrmReportGroupRow[];
  chart_items: CrmChartItem[];
  lead_details: CrmLeadDetailRow[];
};

type CrmResponse = {
  leads: CrmLead[];
  contacts: CrmContact[];
  deals: CrmDeal[];
  meetings: CrmMeeting[];
  salesOrders: CrmSalesOrder[];
  userReport: CrmReport | null;
  teamReport: CrmReport | null;
};

export type SupportedCrmSection = "leads" | "contacts" | "deals" | "meetings" | "salesOrders";

const sectionEndpointMap: Record<SupportedCrmSection, string> = {
  leads: "/api/business-autopilot/leads",
  contacts: "/api/business-autopilot/contacts",
  deals: "/api/business-autopilot/deals",
  meetings: "/api/business-autopilot/meetings",
  salesOrders: "/api/business-autopilot/sales-orders"
};

const sectionIdKeyMap: Record<SupportedCrmSection, string> = {
  leads: "lead_id",
  contacts: "contact_id",
  deals: "deal_id",
  meetings: "meeting_id",
  salesOrders: "sales_order_id"
};

export function useBusinessAutopilotCrm(enabled: boolean) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ data: CrmResponse | null; loading: boolean; error: string }>({
    data: null,
    loading: enabled,
    error: ""
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return;
    }

    let active = true;

    Promise.allSettled([
      apiGet<{ leads: CrmLead[] }>("/api/business-autopilot/leads"),
      apiGet<{ contacts: CrmContact[] }>("/api/business-autopilot/contacts"),
      apiGet<{ deals: CrmDeal[] }>("/api/business-autopilot/deals"),
      apiGet<{ meetings: CrmMeeting[] }>("/api/business-autopilot/meetings"),
      apiGet<{ sales_orders: CrmSalesOrder[] }>("/api/business-autopilot/sales-orders"),
      apiGet<{ report: CrmReport }>("/api/business-autopilot/crm/reports?group_by=user"),
      apiGet<{ report: CrmReport }>("/api/business-autopilot/crm/reports?group_by=team")
    ])
      .then((results) => {
        if (!active) {
          return;
        }

        const errors = results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason?.message || "Unable to load CRM workspace");

        const [leadsResult, contactsResult, dealsResult, meetingsResult, salesOrdersResult, userReportResult, teamReportResult] = results;

        setState({
          data: {
            leads: leadsResult.status === "fulfilled" ? leadsResult.value.leads || [] : [],
            contacts: contactsResult.status === "fulfilled" ? contactsResult.value.contacts || [] : [],
            deals: dealsResult.status === "fulfilled" ? dealsResult.value.deals || [] : [],
            meetings: meetingsResult.status === "fulfilled" ? meetingsResult.value.meetings || [] : [],
            salesOrders: salesOrdersResult.status === "fulfilled" ? salesOrdersResult.value.sales_orders || [] : [],
            userReport: userReportResult.status === "fulfilled" ? userReportResult.value.report || null : null,
            teamReport: teamReportResult.status === "fulfilled" ? teamReportResult.value.report || null : null
          },
          loading: false,
          error: errors.length === results.length ? errors[0] : ""
        });
      })
      .catch((error: Error) => {
        if (active) {
          setState({ data: null, loading: false, error: error.message || "Unable to load CRM workspace" });
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, reloadKey]);

  return {
    ...state,
    refetch: () => setReloadKey((value) => value + 1)
  };
}

export async function createCrmRecord(section: SupportedCrmSection, payload: Record<string, unknown>) {
  return apiPost(sectionEndpointMap[section], payload);
}

export async function updateCrmRecord(section: SupportedCrmSection, id: number, payload: Record<string, unknown>) {
  return apiPost(sectionEndpointMap[section], {
    ...payload,
    [sectionIdKeyMap[section]]: id,
    __crm_action: "PATCH"
  });
}

export async function deleteCrmRecord(section: SupportedCrmSection, id: number) {
  return apiPost(sectionEndpointMap[section], {
    [sectionIdKeyMap[section]]: id,
    __crm_action: "DELETE"
  });
}
