import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function normalizeDateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildMonthlySeriesFromRows(rows = [], amountKey, dateKeys) {
  const byYear = new Map();
  (rows || []).forEach((row) => {
    const rawDate = dateKeys.map((key) => row?.[key]).find(Boolean);
    const date = normalizeDateValue(rawDate);
    if (!date) {
      return;
    }
    const year = date.getFullYear();
    const month = date.getMonth();
    const amount = Number(row?.[amountKey] || row?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    if (!byYear.has(year)) {
      byYear.set(year, Array(12).fill(0));
    }
    byYear.get(year)[month] += amount;
  });
  return byYear;
}

function fallbackMonthlySeries(year) {
  const seed = year % 100;
  return MONTH_LABELS.map((_, index) => {
    const base = 45000 + (((seed * 97) + (index * 43)) % 38000);
    const seasonal = [1.0, 0.92, 1.05, 1.12, 0.98, 1.08, 1.2, 1.1, 1.16, 1.28, 1.34, 1.48][index];
    return Math.round(base * seasonal);
  });
}

function buildPolylinePoints(series, width, height, maxValue) {
  if (!Array.isArray(series) || !series.length) {
    return "";
  }
  const chartHeight = height - 20;
  const stepX = width / Math.max(1, series.length - 1);
  return series
    .map((value, index) => {
      const ratio = maxValue > 0 ? value / maxValue : 0;
      const x = index * stepX;
      const y = chartHeight - (chartHeight * ratio) + 6;
      return `${x},${y}`;
    })
    .join(" ");
}

function toIsoDateLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMeetingCalendarModel(monthDate, meetings = []) {
  const base = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - startOffset);

  const meetingMap = new Map();
  (meetings || []).forEach((row) => {
    const isoDate = String(row?.meetingDate || "").trim();
    if (!isoDate) return;
    if (!meetingMap.has(isoDate)) {
      meetingMap.set(isoDate, []);
    }
    meetingMap.get(isoDate).push(row);
  });

  const cells = Array.from({ length: 35 }).map((_, idx) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + idx);
    const isoDate = toIsoDateLocal(cellDate);
    return {
      isoDate,
      day: cellDate.getDate(),
      inMonth: cellDate.getMonth() === monthStart.getMonth(),
      isToday: isoDate === toIsoDateLocal(new Date()),
      meetings: (meetingMap.get(isoDate) || []).slice().sort((a, b) => String(a.meetingTime || "").localeCompare(String(b.meetingTime || ""))),
    };
  });

  return {
    monthLabel: monthStart.toLocaleString("en-US", { month: "long", year: "numeric" }),
    monthStart,
    monthEnd,
    cells,
  };
}

function MonthlyComparisonChartCard({
  title,
  currentYear,
  currentSeries = [],
  previousYear,
  previousSeries = [],
  icon = "bi-graph-up",
  yPrefix = "INR "
}) {
  const width = 420;
  const height = 180;
  const maxValue = Math.max(1, ...currentSeries, ...previousSeries);
  const currentPoints = buildPolylinePoints(currentSeries, width, height, maxValue);
  const previousPoints = buildPolylinePoints(previousSeries, width, height, maxValue);
  const currentTotal = currentSeries.reduce((sum, value) => sum + Number(value || 0), 0);
  const previousTotal = previousSeries.reduce((sum, value) => sum + Number(value || 0), 0);
  const deltaPercent = previousTotal > 0 ? (((currentTotal - previousTotal) / previousTotal) * 100) : 0;

  return (
    <div className="card p-3 h-100">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center gap-2">
          <div
            className="stat-icon stat-icon-primary flex-shrink-0 d-inline-flex align-items-center justify-content-center"
            style={{ width: 32, height: 32 }}
          >
            <i className={`bi ${icon}`} aria-hidden="true" style={{ fontSize: "1.15rem", lineHeight: 1 }} />
          </div>
          <div>
            <h6 className="mb-0">{title}</h6>
            <div className="text-secondary small">
              {previousYear} vs {currentYear}
            </div>
          </div>
        </div>
        <div className="text-end">
          <div className="small text-secondary">Current Year Total</div>
          <div className="fw-semibold">{yPrefix}{Math.round(currentTotal).toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div className="position-relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-100" role="img" aria-label={`${title} monthly comparison`}>
          {[0.25, 0.5, 0.75, 1].map((line) => (
            <line
              key={line}
              x1="0"
              x2={width}
              y1={(height - 20) - ((height - 20) * line) + 6}
              y2={(height - 20) - ((height - 20) * line) + 6}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}
          <polyline
            points={previousPoints}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={currentPoints}
            fill="none"
            stroke="var(--bs-primary)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="d-flex justify-content-between small text-secondary px-1 mt-1">
          {MONTH_LABELS.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-3 mt-2 small">
        <span className="d-inline-flex align-items-center gap-1">
          <span style={{ width: 12, height: 2, background: "rgba(255,255,255,0.35)", display: "inline-block" }} />
          {previousYear} (Previous)
        </span>
        <span className="d-inline-flex align-items-center gap-1">
          <span style={{ width: 12, height: 2, background: "var(--bs-primary)", display: "inline-block" }} />
          {currentYear} (Current)
        </span>
        <span className={`ms-auto fw-semibold ${deltaPercent >= 0 ? "text-success" : "text-danger"}`}>
          {deltaPercent >= 0 ? "+" : ""}{deltaPercent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function BusinessAutopilotDashboardPage({
  modules = [],
  catalog = [],
  canManageModules = false,
  onToggleModule,
  savingModuleSlug = "",
  moduleError = "",
  productBasePath = "",
  subscriptions = []
}) {
  const [products, setProducts] = useState([]);
  const [accountsWorkspace, setAccountsWorkspace] = useState({});
  const [selectedComparisonYear, setSelectedComparisonYear] = useState(new Date().getFullYear());
  const [crmMeetings, setCrmMeetings] = useState([]);
  const [meetingCalendarMonthDate, setMeetingCalendarMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [quickStats, setQuickStats] = useState({
    myAttendance: 0,
    userCount: 0,
    billPendingAmount: 0,
    openTickets: 0,
    todayMeetings: 0,
    myPlans: Array.isArray(subscriptions) ? subscriptions.length : 0,
  });
  const entries = Array.isArray(modules) ? modules : [];
  const allModules = Array.isArray(catalog) && catalog.length ? catalog : entries;

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) {
          return;
        }
        setProducts(Array.isArray(data?.products) ? data.products : []);
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

  useEffect(() => {
    let active = true;
    async function loadAccountsWorkspace() {
      try {
        const data = await apiFetch("/api/business-autopilot/accounts/workspace");
        if (!active) {
          return;
        }
        setAccountsWorkspace(data?.workspace || {});
      } catch {
        try {
          const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          if (active) {
            setAccountsWorkspace(parsed || {});
          }
        } catch {
          if (active) {
            setAccountsWorkspace({});
          }
        }
      }
    }
    loadAccountsWorkspace();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadQuickStats() {
      let myAttendance = 0;
      let userCount = 0;
      let billPendingAmount = 0;
      let openTickets = 0;
      let todayMeetings = 0;
      const myPlans = Array.isArray(subscriptions) ? subscriptions.length : 0;
      const todayIso = new Date().toISOString().slice(0, 10);

      try {
        const raw = window.localStorage.getItem(HR_STORAGE_KEY);
        const localData = raw ? JSON.parse(raw) : {};
        const attendanceRows = Array.isArray(localData?.attendance) ? localData.attendance : [];
        myAttendance = attendanceRows.some((row) => String(row?.date || "").trim() === todayIso) ? 1 : 0;
      } catch {
        myAttendance = 0;
      }

      try {
        const usersData = await apiFetch("/api/business-autopilot/users");
        userCount = Array.isArray(usersData?.users) ? usersData.users.length : 0;
      } catch {
        userCount = 0;
      }

      try {
        const accountsData = await apiFetch("/api/business-autopilot/accounts/workspace");
        const workspace = accountsData?.workspace || {};
        const invoices = Array.isArray(workspace?.invoices) ? workspace.invoices : [];
        billPendingAmount = invoices
          .filter((row) => {
            const status = String(row?.status || "").toLowerCase();
            return !["paid", "cancelled"].includes(status);
          })
          .reduce((sum, row) => sum + Number(row?.total || 0), 0);
      } catch {
        try {
          const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
          const localData = raw ? JSON.parse(raw) : {};
          const invoices = Array.isArray(localData?.invoices) ? localData.invoices : [];
          billPendingAmount = invoices
            .filter((row) => {
              const status = String(row?.status || "").toLowerCase();
              return !["paid", "cancelled"].includes(status);
            })
            .reduce((sum, row) => sum + Number(row?.total || 0), 0);
        } catch {
          billPendingAmount = 0;
        }
      }

      try {
        const raw = window.localStorage.getItem(TICKETING_STORAGE_KEY);
        const localData = raw ? JSON.parse(raw) : {};
        const tickets = Array.isArray(localData?.tickets) ? localData.tickets : [];
        openTickets = tickets.filter((row) => String(row?.status || "").toLowerCase() !== "closed").length;
      } catch {
        openTickets = 0;
      }

      try {
        const raw = window.localStorage.getItem(CRM_STORAGE_KEY);
        const localData = raw ? JSON.parse(raw) : {};
        const meetings = Array.isArray(localData?.meetings) ? localData.meetings : [];
        if (active) {
          setCrmMeetings(meetings);
        }
        todayMeetings = meetings.filter((row) => String(row?.meetingDate || "").trim() === todayIso).length;
      } catch {
        if (active) {
          setCrmMeetings([]);
        }
        todayMeetings = 0;
      }

      if (!active) {
        return;
      }
      setQuickStats({
        myAttendance,
        userCount,
        billPendingAmount,
        openTickets,
        todayMeetings,
        myPlans,
      });
    }
    loadQuickStats();
    return () => {
      active = false;
    };
  }, [subscriptions]);

  const meetingCalendar = useMemo(
    () => buildMeetingCalendarModel(meetingCalendarMonthDate, crmMeetings),
    [crmMeetings, meetingCalendarMonthDate]
  );

  function changeMeetingCalendarMonth(offset) {
    setMeetingCalendarMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  const toModulePath = (module) => {
    const rawPath = module?.path || `/${module?.slug || ""}`;
    if (!productBasePath) {
      return rawPath;
    }
    if (rawPath === "/") {
      return productBasePath;
    }
    return `${productBasePath}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
  };

  const withProductBase = (path) => {
    if (!path || path === "#") {
      return "#";
    }
    if (!productBasePath) {
      return path;
    }
    return `${productBasePath}${path.startsWith("/") ? path : `/${path}`}`;
  };

  const formatCurrency = (value) =>
    `INR ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statCards = [
    { key: "myAttendance", label: "My Attendance", value: String(quickStats.myAttendance || 0), icon: "bi-calendar-check", href: withProductBase("/hrm#attendance") },
    { key: "users", label: "Total Users", value: String(quickStats.userCount || 0), icon: "bi-people", href: withProductBase("/users") },
    { key: "billing", label: "Bill Pendings", value: formatCurrency(quickStats.billPendingAmount), icon: "bi-wallet2", href: withProductBase("/billing") },
    { key: "tickets", label: "Open Tickets", value: String(quickStats.openTickets || 0), icon: "bi-life-preserver", href: withProductBase("/ticketing") },
    { key: "meetings", label: "Today Meetings", value: String(quickStats.todayMeetings || 0), icon: "bi-calendar-event", href: "#" },
    { key: "plans", label: "My Plans", value: String(quickStats.myPlans || 0), icon: "bi-clipboard-check", href: withProductBase("/plans") },
  ];

  const comparisonData = useMemo(() => {
    const invoiceRows = Array.isArray(accountsWorkspace?.invoices) ? accountsWorkspace.invoices : [];
    const expenseRows = Array.isArray(accountsWorkspace?.expenses) ? accountsWorkspace.expenses : [];

    const salesByYear = buildMonthlySeriesFromRows(invoiceRows, "total", ["issueDate", "date", "createdAt"]);
    const expenseByYear = buildMonthlySeriesFromRows(expenseRows, "amount", ["date", "expenseDate", "createdAt"]);

    const yearCandidates = new Set([new Date().getFullYear(), selectedComparisonYear, selectedComparisonYear - 1]);
    salesByYear.forEach((_value, year) => yearCandidates.add(year));
    expenseByYear.forEach((_value, year) => yearCandidates.add(year));
    const yearOptions = Array.from(yearCandidates).sort((a, b) => b - a).slice(0, 6);

    const selectedYear = yearOptions.includes(selectedComparisonYear) ? selectedComparisonYear : yearOptions[0] || new Date().getFullYear();
    const previousYear = selectedYear - 1;

    const salesCurrent = salesByYear.get(selectedYear) || fallbackMonthlySeries(selectedYear);
    const salesPrevious = salesByYear.get(previousYear) || fallbackMonthlySeries(previousYear).map((v) => Math.round(v * 0.86));

    let expensesCurrent = expenseByYear.get(selectedYear);
    let expensesPrevious = expenseByYear.get(previousYear);
    if (!expensesCurrent) {
      expensesCurrent = salesCurrent.map((value, idx) => Math.round(value * (0.46 + ((idx % 4) * 0.03))));
    }
    if (!expensesPrevious) {
      expensesPrevious = salesPrevious.map((value, idx) => Math.round(value * (0.44 + ((idx % 3) * 0.025))));
    }

    return {
      yearOptions,
      selectedYear,
      previousYear,
      salesCurrent,
      salesPrevious,
      expensesCurrent,
      expensesPrevious,
    };
  }, [accountsWorkspace, selectedComparisonYear]);

  return (
    <div>
      <h4 className="mb-2">Business Autopilot ERP</h4>
      <p className="text-secondary mb-3">
        Modular suite for CRM, HR, Projects, Accounts, Ticketing, and Stocks.
      </p>
      <div className="row g-3 mb-3">
        {statCards.map((card) => (
          <div className="col-12 col-md-6 col-xl-2" key={card.key}>
            <div className="card p-3 h-100">
              <div className="d-flex flex-column align-items-center justify-content-center text-center h-100">
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${card.icon}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {card.href === "#" ? (
                    <a href="#" className="fw-semibold text-decoration-none d-inline-block">
                      {card.label}
                    </a>
                  ) : (
                    <Link to={card.href} className="fw-semibold text-decoration-none d-inline-block">
                      {card.label}
                    </Link>
                  )}
                  <div className="h5 mb-0 mt-1">{card.value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {moduleError ? (
        <div className="alert alert-danger py-2">{moduleError}</div>
      ) : null}
      {entries.length ? (
        <div className="row g-3">
          {entries.map((module) => (
            <div className="col-12 col-md-6 col-xl-2" key={module.slug}>
              <div className="card p-3 h-100 d-flex flex-column">
                <h6 className="mb-1">{module.name}</h6>
                <div className="text-secondary small mb-2">Module Enabled</div>
                <Link className="btn btn-primary btn-sm mt-auto" to={toModulePath(module)}>
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="alert alert-warning mb-0">
          No modules are enabled for this organization yet.
        </div>
      )}
      <div className="mt-4">
        <div className="row g-3">
          <div className="col-12 col-xl-8">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h4 className="mb-0">Monthly Sales & Expenses Comparison</h4>
              <div className="d-flex align-items-center gap-2">
                <label className="small text-secondary mb-0" htmlFor="baerp-comparison-year">Year</label>
                <select
                  id="baerp-comparison-year"
                  className="form-select form-select-sm"
                  style={{ minWidth: "110px" }}
                  value={comparisonData.selectedYear}
                  onChange={(event) => setSelectedComparisonYear(Number(event.target.value))}
                >
                  {comparisonData.yearOptions.map((year) => (
                    <option value={year} key={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row g-3">
              <div className="col-12">
                <MonthlyComparisonChartCard
                  title="Monthly Sales"
                  icon="bi-graph-up-arrow"
                  currentYear={comparisonData.selectedYear}
                  previousYear={comparisonData.previousYear}
                  currentSeries={comparisonData.salesCurrent}
                  previousSeries={comparisonData.salesPrevious}
                />
              </div>
              <div className="col-12">
                <MonthlyComparisonChartCard
                  title="Monthly Expenses"
                  icon="bi-graph-down-arrow"
                  currentYear={comparisonData.selectedYear}
                  previousYear={comparisonData.previousYear}
                  currentSeries={comparisonData.expensesCurrent}
                  previousSeries={comparisonData.expensesPrevious}
                />
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <div className="card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">Meeting Calendar</h6>
                <div className="d-flex align-items-center gap-1">
                  <button type="button" className="btn btn-sm btn-outline-light" onClick={() => changeMeetingCalendarMonth(-1)}>
                    <i className="bi bi-chevron-left" aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-light" onClick={() => changeMeetingCalendarMonth(1)}>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="small text-secondary mb-2">{meetingCalendar.monthLabel}</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: "6px",
                }}
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel) => (
                  <div key={`head-${dayLabel}`} className="small text-secondary text-center fw-semibold">
                    {dayLabel}
                  </div>
                ))}
                {meetingCalendar.cells.map((cell) => (
                  <div
                    key={cell.isoDate}
                    className="rounded"
                    style={{
                      minHeight: "56px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "4px",
                      background: cell.isToday ? "rgba(var(--bs-primary-rgb),0.12)" : "rgba(255,255,255,0.02)",
                      opacity: cell.inMonth ? 1 : 0.45,
                    }}
                    title={cell.meetings.length ? `${cell.meetings.length} meeting(s)` : ""}
                  >
                    <div className="small fw-semibold" style={{ lineHeight: 1.1 }}>{cell.day}</div>
                    {cell.meetings.length ? (
                      <div className="mt-1">
                        <span className="badge bg-success" style={{ fontSize: "0.65rem" }}>
                          {cell.meetings.length}
                        </span>
                        {cell.meetings[0]?.meetingTime ? (
                          <div className="small text-truncate mt-1" style={{ fontSize: "0.68rem" }}>
                            {String(cell.meetings[0].meetingTime)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {canManageModules ? (
        <div className="mt-4">
          <h6 className="mb-2">Module Access Settings</h6>
          <div className="text-secondary small mb-3">Enable or disable eligible ERP modules for your organization.</div>
          <div className="row g-2">
            {allModules.map((module) => (
              <div className="col-12 col-md-6 col-xl-2" key={`toggle-${module.slug}`}>
                <div className="d-flex align-items-center justify-content-between border rounded px-2 py-2 h-100 gap-2">
                  <div className="min-w-0">
                    <div className="fw-semibold">{module.name}</div>
                    <div className="text-secondary small">{module.enabled ? "Enabled" : "Disabled"}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      type="button"
                      className={`btn btn-sm ${module.enabled ? "btn-outline-danger" : "btn-outline-success"}`}
                      disabled={savingModuleSlug === module.slug}
                      onClick={() => onToggleModule && onToggleModule(module.slug, !module.enabled)}
                    >
                      {savingModuleSlug === module.slug ? "Saving..." : module.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        currentProductKey="business-autopilot-erp"
      />
    </div>
  );
}
