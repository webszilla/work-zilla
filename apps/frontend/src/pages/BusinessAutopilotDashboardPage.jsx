import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";
import { formatCurrencyAmount, getOrgCurrency, setOrgCurrency as applyOrgCurrency } from "../lib/orgCurrency.js";

const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const CRM_STORAGE_KEY_ACTIVE = "wz_business_autopilot_crm_active_key";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const LAST_SIGNOUT_AT_STORAGE_KEY = "wz_last_signout_at";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getCurrentTimeHm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatTimeToAmPm(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return "-";
  }
  const [hhRaw, mmRaw] = raw.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return "-";
  }
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function toMinutesFromHm(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return null;
  }
  const [hhRaw, mmRaw] = raw.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return (hh * 60) + mm;
}

function formatDurationFromMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes || 0)));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hourLabel = hours === 1 ? "Hr" : "Hrs";
  const minLabel = mins === 1 ? "Min" : "Min";
  return `${hours} ${hourLabel} ${String(mins).padStart(2, "0")} ${minLabel}`;
}

function computeDurationMinutes(startHm, endHm) {
  const start = toMinutesFromHm(startHm);
  const end = toMinutesFromHm(endHm);
  if (start == null || end == null) {
    return null;
  }
  if (end < start) {
    return null;
  }
  return end - start;
}

function normalizeAttendanceRows(value) {
  return Array.isArray(value) ? value : [];
}

function isDeletedAttendanceRow(row) {
  return Boolean(row?.is_deleted || row?.isDeleted || row?.deleted_at || row?.deletedAt);
}

function normalizeDeletedAttendanceRow(row) {
  const normalized = row && typeof row === "object" ? { ...row } : {};
  const isDeleted = Boolean(normalized.is_deleted || normalized.isDeleted);
  const deletedAt = String(normalized.deleted_at || normalized.deletedAt || "").trim();
  if (isDeleted || deletedAt) {
    normalized.is_deleted = true;
    normalized.deleted_at = deletedAt || "";
  }
  return normalized;
}

function purgeOldDeletedAttendanceRows(rows, days = 60) {
  const maxAgeMs = Math.max(1, Number(days || 60)) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const normalized = normalizeDeletedAttendanceRow(row);
    if (!normalized.is_deleted) {
      return true;
    }
    const deletedAt = String(normalized.deleted_at || "").trim();
    if (!deletedAt) {
      return true;
    }
    const ts = Date.parse(deletedAt);
    if (Number.isNaN(ts)) {
      return true;
    }
    return (now - ts) <= maxAgeMs;
  });
}

function safeReadHrModuleData() {
  try {
    const raw = window.localStorage.getItem(HR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = parsed && typeof parsed === "object" ? parsed : {};
    const attendance = purgeOldDeletedAttendanceRows(normalizeAttendanceRows(base.attendance)).map((row) => normalizeDeletedAttendanceRow(row));
    const next = { ...base, attendance };
    // Keep storage cleaned up so other pages (HR) read consistent data.
    safeWriteHrModuleData(next);
    return next;
  } catch {
    return {};
  }
}

function safeWriteHrModuleData(nextData) {
  try {
    window.localStorage.setItem(HR_STORAGE_KEY, JSON.stringify(nextData || {}));
  } catch {
    // Ignore storage write failures.
  }
}

function upsertAttendanceRow({ employeeName, isoDate, patch = {}, preserveExistingPunchTimes = false }) {
  const name = String(employeeName || "").trim();
  const date = String(isoDate || "").trim();
  if (!name || !date) {
    return null;
  }
  const data = safeReadHrModuleData();
  const rows = purgeOldDeletedAttendanceRows(normalizeAttendanceRows(data.attendance)).map((row) => normalizeDeletedAttendanceRow(row));
  let index = rows.findIndex((row) =>
    !isDeletedAttendanceRow(row)
    && String(row?.employee || "").trim() === name
    && String(row?.date || "").trim() === date
  );
  if (index < 0) {
    index = rows.findIndex((row) =>
      String(row?.employee || "").trim() === name && String(row?.date || "").trim() === date
    );
  }
  const base = index >= 0 ? (rows[index] || {}) : {
    id: `attendance_${Date.now()}`,
    employee: name,
    date,
    entryMode: "User Side",
    inTime: "",
    outTime: "",
    workedHours: "",
    status: "Present",
    permissionHours: "",
    notes: "",
    completedTasks: "",
    taskNotes: "",
  };
  const nextRow = { ...base, is_deleted: false, deleted_at: "", ...patch, employee: name, date };
  if (preserveExistingPunchTimes) {
    const baseInTime = String(base?.inTime || "").trim();
    const baseOutTime = String(base?.outTime || "").trim();
    if (baseInTime) {
      nextRow.inTime = baseInTime;
    }
    if (baseOutTime) {
      nextRow.outTime = baseOutTime;
    }
  }
  const nextRows = index >= 0
    ? rows.map((row, idx) => (idx === index ? nextRow : row))
    : [nextRow, ...rows];
  safeWriteHrModuleData({ ...data, attendance: nextRows });
  return nextRow;
}

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

function formatDateTime(value) {
  if (!value) {
    return "Not Available";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not Available";
  }
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
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
          <div className="fw-semibold">{yPrefix}{Math.round(currentTotal).toLocaleString("en-US")}</div>
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
              stroke="var(--bs-border-color)"
              strokeOpacity="0.6"
              strokeWidth="1"
            />
          ))}
          <polyline
            points={previousPoints}
            fill="none"
            stroke="var(--bs-secondary-color)"
            strokeOpacity="0.95"
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
          <span style={{ width: 12, height: 2, background: "var(--bs-secondary-color)", opacity: 0.95, display: "inline-block" }} />
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
  hasDashboardFullAccess = false,
  onToggleModule,
  savingModuleSlug = "",
  moduleError = "",
  productBasePath = "",
  subscriptions = [],
  isOrgAdmin = false,
}) {
  const [orgCurrency, setOrgCurrency] = useState(() => getOrgCurrency());
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
    newMails: 0,
    todayMeetings: 0,
    myPlans: Array.isArray(subscriptions) ? subscriptions.length : 0,
    lastSignoutAt: "",
  });
  const [currentUserName, setCurrentUserName] = useState("");
  const [attendancePunch, setAttendancePunch] = useState({ mode: "in", saving: false, error: "" });
  const [attendanceToday, setAttendanceToday] = useState({ inTime: "", outTime: "", durationLabel: "", hasIn: false, hasOut: false });
  const attendancePunchLockRef = useRef(false);
  const [attendanceOutModal, setAttendanceOutModal] = useState({
    open: false,
    outTime: "",
    completedTasks: "",
    taskNotes: "",
  });
  const entries = Array.isArray(modules) ? modules : [];
  const allModules = Array.isArray(catalog) && catalog.length ? catalog : entries;

  function readTodayAttendanceRow(employeeName) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const hrData = safeReadHrModuleData();
    const attendanceRows = normalizeAttendanceRows(hrData?.attendance);
    return attendanceRows.find((row) =>
      !isDeletedAttendanceRow(row)
      && String(row?.employee || "").trim() === employeeName
      && String(row?.date || "").trim() === todayIso
    ) || null;
  }

  function syncAttendanceToday(employeeName) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const hrData = safeReadHrModuleData();
    const attendanceRows = normalizeAttendanceRows(hrData?.attendance);
    const todayRow = attendanceRows.find((row) =>
      !isDeletedAttendanceRow(row)
      && String(row?.employee || "").trim() === employeeName
      && String(row?.date || "").trim() === todayIso
    ) || null;
    const inTime = String(todayRow?.inTime || "").trim();
    const outTime = String(todayRow?.outTime || "").trim();
    const hasIn = Boolean(inTime);
    const hasOut = Boolean(outTime);

    const nowHm = getCurrentTimeHm();
    const durationMinutes = hasIn
      ? (hasOut ? computeDurationMinutes(inTime, outTime) : computeDurationMinutes(inTime, nowHm))
      : null;
    const durationLabel = durationMinutes == null ? "" : `(${formatDurationFromMinutes(durationMinutes)})`;

    setAttendanceToday({ inTime, outTime, durationLabel, hasIn, hasOut });
    setAttendancePunch((prev) => ({
      ...prev,
      mode: hasIn && hasOut ? "done" : (hasIn ? "out" : "in"),
    }));
    if (hasIn) {
      setQuickStats((prev) => ({ ...prev, myAttendance: 1 }));
    }
  }

  function closeAttendanceOutModal() {
    setAttendanceOutModal((prev) => ({ ...prev, open: false }));
  }

  function openAttendanceOutModal() {
    const employeeName = String(currentUserName || "").trim();
    if (!employeeName) {
      setAttendancePunch((prev) => ({ ...prev, error: "Unable to resolve employee name." }));
      return;
    }
    const todayRow = readTodayAttendanceRow(employeeName);
    if (!String(todayRow?.inTime || "").trim()) {
      setAttendancePunch((prev) => ({ ...prev, error: "Please punch in first." }));
      syncAttendanceToday(employeeName);
      return;
    }
    if (String(todayRow?.outTime || "").trim()) {
      setAttendancePunch((prev) => ({ ...prev, error: "Attendance already completed for today." }));
      syncAttendanceToday(employeeName);
      return;
    }
    setAttendanceOutModal({
      open: true,
      outTime: getCurrentTimeHm(),
      completedTasks: String(todayRow?.completedTasks || "").trim(),
      taskNotes: String(todayRow?.taskNotes || "").trim(),
    });
  }

  function submitAttendanceOutModal(event) {
    event.preventDefault();
    const employeeName = String(currentUserName || "").trim();
    if (!employeeName) {
      closeAttendanceOutModal();
      return;
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    if (attendancePunchLockRef.current) {
      return;
    }
    attendancePunchLockRef.current = true;
    try {
      const todayRow = readTodayAttendanceRow(employeeName);
      if (!String(todayRow?.inTime || "").trim()) {
        closeAttendanceOutModal();
        setAttendancePunch((prev) => ({ ...prev, error: "Please punch in first." }));
        syncAttendanceToday(employeeName);
        return;
      }
      if (String(todayRow?.outTime || "").trim()) {
        closeAttendanceOutModal();
        setAttendancePunch((prev) => ({ ...prev, error: "Attendance already completed for today." }));
        syncAttendanceToday(employeeName);
        return;
      }
      upsertAttendanceRow({
        employeeName,
        isoDate: todayIso,
        patch: {
          entryMode: "User Side",
          outTime: attendanceOutModal.outTime || getCurrentTimeHm(),
          status: "Present",
          completedTasks: String(attendanceOutModal.completedTasks || "").trim(),
          taskNotes: String(attendanceOutModal.taskNotes || "").trim(),
        },
        preserveExistingPunchTimes: true,
      });
      closeAttendanceOutModal();
      setAttendancePunch((prev) => ({ ...prev, error: "" }));
      syncAttendanceToday(employeeName);
    } finally {
      attendancePunchLockRef.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const authData = await apiFetch("/api/auth/me").catch(() => null);
      if (!active) return;
      const fallbackName = String(
        authData?.user?.first_name
        || authData?.user?.username
        || authData?.profile?.name
        || ""
      ).trim();
      const normalizedEmail = String(authData?.user?.email || "").trim().toLowerCase();
      const usersData = normalizedEmail ? await apiFetch("/api/business-autopilot/users").catch(() => null) : null;
      const directoryUsers = Array.isArray(usersData?.users) ? usersData.users : [];
      const matchedDirectoryUser = normalizedEmail
        ? directoryUsers.find((row) => String(row?.email || "").trim().toLowerCase() === normalizedEmail)
        : null;
      const resolvedName = String(matchedDirectoryUser?.name || fallbackName || "Current User").trim() || "Current User";
      setCurrentUserName(resolvedName);
      syncAttendanceToday(resolvedName);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserName) {
      return undefined;
    }
    const onFocus = () => syncAttendanceToday(currentUserName);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [currentUserName]);

  useEffect(() => {
    if (!attendanceToday.hasIn || attendanceToday.hasOut) {
      return undefined;
    }
    if (!currentUserName) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      syncAttendanceToday(currentUserName);
    }, 30 * 1000);
    return () => window.clearInterval(timer);
  }, [attendanceToday.hasIn, attendanceToday.hasOut, currentUserName]);

  useEffect(() => {
    let active = true;
    async function loadOrgCurrency() {
      try {
        const data = await apiFetch("/api/dashboard/billing-profile");
        if (!active) {
          return;
        }
        const nextCurrency = applyOrgCurrency(String(data?.profile?.currency || "INR").trim().toUpperCase() || "INR");
        setOrgCurrency(nextCurrency);
      } catch {
        if (active) {
          setOrgCurrency(getOrgCurrency());
        }
      }
    }
    loadOrgCurrency();
    const syncCurrency = () => setOrgCurrency(getOrgCurrency());
    window.addEventListener("storage", syncCurrency);
    window.addEventListener("focus", syncCurrency);
    return () => {
      active = false;
      window.removeEventListener("storage", syncCurrency);
      window.removeEventListener("focus", syncCurrency);
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
      let newMails = 0;
      let todayMeetings = 0;
      const myPlans = Array.isArray(subscriptions) ? subscriptions.length : 0;
      const lastSignoutAt = String(window.localStorage.getItem(LAST_SIGNOUT_AT_STORAGE_KEY) || "").trim();
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
        const scopedKey = String(window.localStorage.getItem(CRM_STORAGE_KEY_ACTIVE) || "").trim();
        const raw = window.localStorage.getItem(scopedKey || CRM_STORAGE_KEY);
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

      try {
        const inboxData = await apiFetch("/api/dashboard/inbox");
        newMails = Number(inboxData?.unread_count || 0);
        if (!Number.isFinite(newMails) || newMails < 0) {
          newMails = 0;
        }
      } catch {
        newMails = 0;
      }

      if (!active) {
        return;
      }
      setQuickStats({
        myAttendance,
        userCount,
        billPendingAmount,
        openTickets,
        newMails,
        todayMeetings,
        myPlans,
        lastSignoutAt,
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

  const formatCurrency = (value) => formatCurrencyAmount(value, orgCurrency);

  const adminStatCards = [
    { key: "myAttendance", label: "My Attendance", value: String(quickStats.myAttendance || 0), icon: "bi-calendar-check", href: withProductBase("/hrm#attendance") },
    { key: "users", label: "Total Users", value: String(quickStats.userCount || 0), icon: "bi-people", href: withProductBase("/users") },
    { key: "billing", label: "Bill Pendings", value: formatCurrency(quickStats.billPendingAmount), icon: "bi-wallet2", href: withProductBase("/billing") },
    { key: "tickets", label: "Open Tickets", value: String(quickStats.openTickets || 0), icon: "bi-life-preserver", href: withProductBase("/ticketing") },
    { key: "meetings", label: "Today Meetings", value: String(quickStats.todayMeetings || 0), icon: "bi-calendar-event", href: "#" },
    { key: "plans", label: "My Plans", value: String(quickStats.myPlans || 0), icon: "bi-clipboard-check", href: withProductBase("/plans") },
  ];
  const userStatCards = [
    { key: "tickets", label: "Open Tickets", value: String(quickStats.openTickets || 0), icon: "bi-life-preserver", href: withProductBase("/ticketing") },
    { key: "mails", label: "New Mails", value: String(quickStats.newMails || 0), icon: "bi-envelope", href: withProductBase("/inbox-and-ticket") },
    { key: "meetings", label: "Today Meetings", value: String(quickStats.todayMeetings || 0), icon: "bi-calendar-event", href: "#" },
    { key: "lastSignout", label: "My Last Signout", value: formatDateTime(quickStats.lastSignoutAt), icon: "bi-box-arrow-right", href: "#" },
  ];
  const useAdminDashboardView = isOrgAdmin || hasDashboardFullAccess;
  const statCards = useAdminDashboardView ? adminStatCards : userStatCards;
  const showDashboardDetails = useAdminDashboardView;

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

  function handleSelfAttendancePunch(nextMode) {
    const employeeName = String(currentUserName || "").trim();
    if (!employeeName) {
      setAttendancePunch((prev) => ({ ...prev, error: "Unable to resolve employee name." }));
      return;
    }
    if (nextMode === "out") {
      openAttendanceOutModal();
      return;
    }
    if (attendancePunchLockRef.current) {
      return;
    }
    attendancePunchLockRef.current = true;
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      setAttendancePunch((prev) => ({ ...prev, saving: true, error: "" }));
      const hrData = safeReadHrModuleData();
      const attendanceRows = normalizeAttendanceRows(hrData?.attendance);
      const todayRow = attendanceRows.find((row) =>
        String(row?.employee || "").trim() === employeeName && String(row?.date || "").trim() === todayIso
      ) || null;

      if (nextMode === "in") {
        if (String(todayRow?.outTime || "").trim()) {
          setAttendancePunch((prev) => ({ ...prev, saving: false, mode: "done", error: "Attendance already completed for today." }));
          syncAttendanceToday(employeeName);
          return;
        }
        if (String(todayRow?.inTime || "").trim()) {
          setAttendancePunch((prev) => ({ ...prev, saving: false, mode: "out", error: "Already punched in today." }));
          syncAttendanceToday(employeeName);
          return;
        }
        upsertAttendanceRow({
          employeeName,
          isoDate: todayIso,
          patch: { entryMode: "User Side", inTime: getCurrentTimeHm(), status: "Present" },
          preserveExistingPunchTimes: true,
        });
        setQuickStats((prev) => ({ ...prev, myAttendance: 1 }));
        setAttendancePunch((prev) => ({ ...prev, saving: false, mode: "out", error: "" }));
        syncAttendanceToday(employeeName);
        return;
      }
    } catch {
      setAttendancePunch((prev) => ({ ...prev, saving: false, error: "Unable to update attendance. Please try again." }));
    } finally {
      attendancePunchLockRef.current = false;
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h4 className="mb-0">Business Autopilot</h4>
        <div className="d-flex flex-column align-items-end gap-1">
          <div className="d-flex align-items-center gap-2">
            <Link
              to={withProductBase("/hrm/#attendance")}
              className="small text-secondary text-decoration-underline"
              title="Open Attendance"
            >
              My Attendance:
            </Link>
            {attendancePunch.error ? (
              <span className="small text-danger">{attendancePunch.error}</span>
            ) : null}
          {attendancePunch.mode === "out" ? (
            <button
              type="button"
              className="btn btn-outline-info btn-sm"
              disabled={attendancePunch.saving}
              onClick={() => handleSelfAttendancePunch("out")}
              title="Attendance Out"
            >
              {attendancePunch.saving ? "Saving..." : "Out"}
            </button>
          ) : attendancePunch.mode === "done" ? (
            <Link
              to={withProductBase("/hrm/#attendance")}
              className="btn btn-outline-light btn-sm"
              title="Open Attendance"
            >
              Done
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              disabled={attendancePunch.saving}
              onClick={() => handleSelfAttendancePunch("in")}
              title="Attendance In"
            >
              {attendancePunch.saving ? "Saving..." : "In"}
            </button>
          )}
          </div>
          {attendanceToday.hasIn ? (
            <div className="small text-secondary" style={{ lineHeight: 1.2, textAlign: "right" }}>
              In {formatTimeToAmPm(attendanceToday.inTime)} {attendanceToday.durationLabel}
              {attendanceToday.hasOut ? ` • Out ${formatTimeToAmPm(attendanceToday.outTime)}` : ""}
            </div>
          ) : null}
        </div>
      </div>
      {attendanceOutModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeAttendanceOutModal}
        >
          <div
            className="card p-3"
            style={{ width: "min(700px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-2">
              <div>
                <h5 className="mb-1">Attendance Out - Completed Tasks</h5>
                <div className="small text-secondary">
                  {currentUserName || "-"} • {new Date().toISOString().slice(0, 10)}
                  {attendanceOutModal.outTime ? ` • Out Time ${formatTimeToAmPm(attendanceOutModal.outTime)}` : ""}
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeAttendanceOutModal}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={submitAttendanceOutModal}>
              <div>
                <label className="form-label small text-secondary mb-1">Completed Work Task List</label>
                <textarea
                  className="form-control"
                  rows={5}
                  placeholder="Enter completed tasks (one line per task / summary details)"
                  value={attendanceOutModal.completedTasks}
                  onChange={(e) => setAttendanceOutModal((prev) => ({ ...prev, completedTasks: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label small text-secondary mb-1">Notes (Optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Blockers / pending follow-up / handover notes"
                  value={attendanceOutModal.taskNotes}
                  onChange={(e) => setAttendanceOutModal((prev) => ({ ...prev, taskNotes: e.target.value }))}
                />
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">Save & Attendance Out</button>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={closeAttendanceOutModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <p className="text-secondary mb-3">
        Modular suite for CRM, HR, Projects, Accounts, Ticketing, and Stocks.
      </p>
      <div className="row g-3 mb-3">
        {statCards.map((card) => (
          <div className={`col-12 col-md-6 ${isOrgAdmin ? "col-xl-2" : "col-xl-3"}`} key={card.key}>
            <div className="card p-3 h-100 stat-card">
              <div className="stat-icon stat-icon-primary">
                <i className={`bi ${card.icon}`} aria-hidden="true" />
              </div>
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
        ))}
      </div>
      {showDashboardDetails ? (
        <>
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
          <div style={{ marginTop: "40px" }}>
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
                  <div className="col-12 col-lg-6">
                    <MonthlyComparisonChartCard
                      title="Monthly Sales"
                      icon="bi-graph-up-arrow"
                      currentYear={comparisonData.selectedYear}
                      previousYear={comparisonData.previousYear}
                      currentSeries={comparisonData.salesCurrent}
                      previousSeries={comparisonData.salesPrevious}
                      yPrefix={`${orgCurrency} `}
                    />
                  </div>
                  <div className="col-12 col-lg-6">
                    <MonthlyComparisonChartCard
                      title="Monthly Expenses"
                      icon="bi-graph-down-arrow"
                      currentYear={comparisonData.selectedYear}
                      previousYear={comparisonData.previousYear}
                      currentSeries={comparisonData.expensesCurrent}
                      previousSeries={comparisonData.expensesPrevious}
                      yPrefix={`${orgCurrency} `}
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
                  <div className="ba-dashboard-calendar-grid">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel) => (
                      <div key={`head-${dayLabel}`} className="small text-secondary fw-semibold ba-dashboard-calendar-head">
                        {dayLabel}
                      </div>
                    ))}
                    {meetingCalendar.cells.map((cell) => (
                      <div
                        key={cell.isoDate}
                        className={`rounded ba-dashboard-calendar-cell ${cell.isToday ? "ba-dashboard-calendar-cell--today" : ""} ${cell.inMonth ? "ba-dashboard-calendar-cell--in-month" : "ba-dashboard-calendar-cell--out-month"}` }
                        title={cell.meetings.length ? `${cell.meetings.length} meeting(s)` : ""}
                      >
                        <div className="small fw-semibold ba-dashboard-calendar-day">{cell.day}</div>
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
        </>
      ) : null}
      {showDashboardDetails && canManageModules ? (
        <div className="mt-4">
          <h6 className="mb-2">Module Access Settings</h6>
          <div className="text-secondary small mb-3">Enable or disable eligible ERP modules for your organization.</div>
          <div className="row g-2">
            {allModules.map((module) => (
              <div className="col-12 col-md-6 col-lg-3" key={`toggle-${module.slug}`}>
                <div className="d-flex align-items-center justify-content-between border rounded px-2 py-2 h-100 gap-2">
                  <div className="min-w-0">
                    <div className="fw-semibold">{module.name}</div>
                    <div className="text-secondary small">
                      {module.eligible ? (module.enabled ? "Enabled" : "Disabled") : "Plan Locked"}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      type="button"
                      className={`btn btn-sm ${module.enabled ? "btn-outline-danger" : "btn-outline-success"}`}
                      disabled={savingModuleSlug === module.slug || module.eligible === false}
                      onClick={() => onToggleModule && onToggleModule(module.slug, !module.enabled)}
                    >
                      {savingModuleSlug === module.slug ? "Saving..." : module.eligible === false ? "Locked" : module.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {showDashboardDetails ? (
        <ProductAccessSection
          products={products}
          subscriptions={subscriptions}
          currentProductKey="business-autopilot-erp"
        />
      ) : null}
    </div>
  );
}
