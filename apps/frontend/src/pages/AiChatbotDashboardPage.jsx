import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function AiChatbotDashboardPage({ subscriptions = [] }) {
  const [state, setState] = useState(emptyState);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const data = await apiFetch("/api/ai-chatbot/dashboard/summary");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load AI Chatbot dashboard.",
            data: null
          });
        }
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) {
          return;
        }
        setProducts(data.products || []);
      } catch {
        if (active) {
          setProducts([]);
        }
      }
    }
    loadProducts();
    return () => {
      active = false;
    };
  }, []);

  const data = state.data || {};
  const billing = data.billing_preview || {};
  const aiUsagePercent = data.ai_usage_percent ?? 0;
  const aiUsageBar = Math.max(0, Math.min(100, aiUsagePercent));

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading AI Chatbot dashboard...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="alert alert-danger">
        {state.error}
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">AI Chatbot Dashboard</h2>
      <hr className="section-divider" />

      <div className="row g-3">
        <div className="col-12 col-md-6 col-xl-3">
          <div className="card p-3 text-center h-100">
            <div className="stat-icon" style={{ color: "#4dabff" }}>
              <i className="bi bi-people" aria-hidden="true" />
            </div>
            <h5>Agents Total</h5>
            <div className="stat-value" style={{ color: "#4dabff" }}>
              {data.agents_total ?? 0}
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <div className="card p-3 text-center h-100">
            <div className="stat-icon" style={{ color: "#3ef58a" }}>
              <i className="bi bi-check2-circle" aria-hidden="true" />
            </div>
            <h5>Agents Included</h5>
            <div className="stat-value" style={{ color: "#3ef58a" }}>
              {data.agents_included ?? 0}
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <div className="card p-3 text-center h-100">
            <div className="stat-icon" style={{ color: "#ffdd57" }}>
              <i className="bi bi-plus-circle" aria-hidden="true" />
            </div>
            <h5>Extra Agents</h5>
            <div className="stat-value" style={{ color: "#ffdd57" }}>
              {data.agents_extra ?? 0}
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <div className="card p-3 text-center h-100">
            <div className="stat-icon" style={{ color: "#ff6b6b" }}>
              <i className="bi bi-robot" aria-hidden="true" />
            </div>
            <h5>AI Replies Used</h5>
            <div className="stat-value" style={{ color: "#ff6b6b" }}>
              {data.ai_replies_used_this_month ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-2">
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 ai-chatbot-summary-card">
            <h5>AI Usage Limit</h5>
            <div className="ai-chatbot-summary-row">
              <span>Monthly Limit</span>
              <strong>{data.ai_replies_limit ?? 0}</strong>
            </div>
            <div className="ai-chatbot-summary-row">
              <span>Usage</span>
              <strong>{aiUsagePercent}% this month</strong>
            </div>
            <div className="ai-chatbot-usage-bar">
              <span style={{ width: `${aiUsageBar}%` }} />
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 ai-chatbot-summary-card">
            <h5>Subscription</h5>
            <div className="ai-chatbot-summary-row">
              <span>Plan</span>
              <strong>{data.plan_name || "-"}</strong>
            </div>
            <div className="ai-chatbot-summary-row">
              <span>Billing Cycle</span>
              <strong>{data.billing_cycle || "-"}</strong>
            </div>
            <div className="ai-chatbot-summary-note">
              Manage plan settings from Billing when available.
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 ai-chatbot-summary-card">
            <h5>Billing Preview</h5>
            <div className="ai-chatbot-summary-row">
              <span>Base Amount</span>
              <strong>INR {billing.base_amount ?? 0}</strong>
            </div>
            <div className="ai-chatbot-summary-row">
              <span>Add-on Amount</span>
              <strong>INR {billing.addon_amount ?? 0}</strong>
            </div>
            <div className="ai-chatbot-summary-row ai-chatbot-summary-row--total">
              <span>Total Amount</span>
              <strong>INR {billing.total_amount ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 mt-4">
        <h4>Quick Actions</h4>
        <div className="d-flex gap-2 flex-wrap mt-2">
          <Link to="/ai-chatbot/inbox" className="btn btn-outline-light btn-sm">
            Open Inbox
          </Link>
          <Link to="/ai-chatbot/widgets" className="btn btn-outline-light btn-sm">
            Manage Widgets
          </Link>
          <Link to="/ai-chatbot/leads" className="btn btn-outline-light btn-sm">
            View Leads
          </Link>
        </div>
      </div>

      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        isReadOnly={false}
      />
    </>
  );
}
