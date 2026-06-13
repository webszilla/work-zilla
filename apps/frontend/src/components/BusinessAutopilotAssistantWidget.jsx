import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, getCsrfToken } from "../lib/api.js";
import { formatDateLikeValue } from "../lib/datetime.js";
import AiAvatar from "./chat/AiAvatar.jsx";
import { getAiEmotionEmoji, getAiEmotionFromText } from "./chat/aiAvatarConfig.js";
import PushToTalkButton from "./chat/PushToTalkButton.jsx";
import { useBrowserSpeechInput } from "./chat/useBrowserSpeechInput.js";
import { useAudioRecorder } from "./chat/useAudioRecorder.js";
import { useSpeechPlayback } from "./chat/useSpeechPlayback.js";
import { useWakeWordDetector } from "./chat/useWakeWordDetector.js";

const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";

function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeWakeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWakePhrase(settings = {}) {
  const customWakePhrase = String(settings?.wake_phrase || "").trim();
  if (customWakePhrase) {
    return customWakePhrase;
  }
  const agentName = String(settings?.agent_name || "Assistant").trim() || "Assistant";
  return `Hi ${agentName}`;
}

function detectScriptLanguage(value = "") {
  const text = String(value || "");
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return "ta-IN";
  }
  if (/[\u0C00-\u0C7F]/.test(text)) {
    return "te-IN";
  }
  if (/[\u0C80-\u0CFF]/.test(text)) {
    return "kn-IN";
  }
  return "en-IN";
}

function containsIndicScript(value = "") {
  return /[\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF]/.test(String(value || ""));
}

function levenshteinDistance(a = "", b = "") {
  const left = String(a || "");
  const right = String(b || "");
  if (!left) return right.length;
  if (!right) return left.length;
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function normalizeWakeToken(token = "") {
  return String(token || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/ph/g, "f")
    .replace(/v/g, "w")
    .replace(/z/g, "s")
    .replace(/j/g, "g")
    .trim();
}

function buildWakeSkeleton(token = "") {
  return normalizeWakeToken(token).replace(/[aeiou]/g, "");
}

function buildWakeAliases(settings = {}) {
  const customWakePhrase = normalizeWakeText(String(settings?.wake_phrase || "").trim());
  if (customWakePhrase) {
    return [customWakePhrase];
  }
  const agentName = normalizeWakeText(String(settings?.agent_name || "").trim());
  if (!agentName) {
    return [];
  }
  return [agentName, `hi ${agentName}`, `hey ${agentName}`];
}

function wakeTokenMatches(sourceToken = "", targetToken = "") {
  const left = normalizeWakeToken(sourceToken);
  const right = normalizeWakeToken(targetToken);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const leftSkeleton = buildWakeSkeleton(left);
  const rightSkeleton = buildWakeSkeleton(right);
  if (leftSkeleton && rightSkeleton && (leftSkeleton === rightSkeleton || leftSkeleton.includes(rightSkeleton) || rightSkeleton.includes(leftSkeleton))) {
    return true;
  }
  if (left.includes(right) || right.includes(left)) {
    return true;
  }
  const threshold = Math.max(1, Math.ceil(Math.max(left.length, right.length) / 3));
  return levenshteinDistance(left, right) <= threshold;
}

function extractWakeCommand(inputText = "", settings = {}) {
  const rawText = String(inputText || "").trim();
  if (!rawText) {
    return { triggered: false, command: "" };
  }
  const normalizedText = normalizeWakeText(rawText);
  const normalizedTokens = normalizedText.split(" ").filter(Boolean);
  const triggerPhrases = buildWakeAliases(settings);
  for (const trigger of triggerPhrases) {
    const normalizedTrigger = normalizeWakeText(trigger);
    if (!normalizedTrigger) {
      continue;
    }
    const triggerTokens = normalizedTrigger.split(" ").filter(Boolean);
    if (normalizedText === normalizedTrigger) {
      return {
        triggered: true,
        command: "",
      };
    }
    const prefixMatches = triggerTokens.length > 0
      && triggerTokens.every((token, index) => wakeTokenMatches(normalizedTokens[index] || "", token));
    if (prefixMatches && normalizedTokens.length > triggerTokens.length) {
      const command = normalizedTokens.slice(triggerTokens.length).join(" ").trim();
      return {
        triggered: true,
        command,
      };
    }
  }
  return { triggered: false, command: "" };
}

function isWakeListeningStopCommand(inputText = "", settings = {}) {
  const normalizedText = normalizeWakeText(inputText);
  if (!normalizedText) {
    return false;
  }
  const assistantName = String(settings?.agent_name || "Maya").trim();
  const normalizedAssistantName = normalizeWakeText(assistantName);
  const commandPhrases = [
    `maya stop listening`,
    `maya close our discussion`,
    `maya you can leave now`,
    `${normalizedAssistantName} stop listening`,
    `${normalizedAssistantName} close our discussion`,
    `${normalizedAssistantName} you can leave now`,
  ].filter(Boolean);
  return commandPhrases.some((phrase) => phrase && normalizedText === phrase);
}

function buildAssistantContext({ quickStats = {}, crmMeetings = [], accountsWorkspace = {}, subscriptions = [] } = {}) {
  const todayIso = getTodayIso();
  const hrData = readStorage(HR_STORAGE_KEY);
  const crmData = readStorage(CRM_STORAGE_KEY);
  const ticketingData = readStorage(TICKETING_STORAGE_KEY);
  const accountsData = Object.keys(accountsWorkspace || {}).length ? accountsWorkspace : readStorage(ACCOUNTS_STORAGE_KEY);

  const attendanceRows = Array.isArray(hrData.attendance) ? hrData.attendance : [];
  const leaveRows = Array.isArray(hrData.leaves) ? hrData.leaves : [];
  const salaryHistoryRows = Array.isArray(hrData.salaryHistory) ? hrData.salaryHistory : [];
  const followUps = Array.isArray(crmData.followUps) ? crmData.followUps : [];
  const meetings = Array.isArray(crmMeetings) && crmMeetings.length ? crmMeetings : (Array.isArray(crmData.meetings) ? crmData.meetings : []);
  const activities = Array.isArray(crmData.activities) ? crmData.activities : [];
  const allTickets = Array.isArray(ticketingData.tickets) ? ticketingData.tickets : [];
  const openTickets = allTickets.filter((row) => String(row?.status || "").trim().toLowerCase() !== "closed");
  const invoices = Array.isArray(accountsData.invoices) ? accountsData.invoices : [];

  const todaysLeaveEmployees = attendanceRows
    .filter((row) => String(row?.date || "").trim() === todayIso && String(row?.status || "").trim().toLowerCase() === "leave")
    .map((row) => String(row?.employee || "").trim())
    .filter(Boolean);

  const pendingLeaves = leaveRows
    .filter((row) => String(row?.status || "").trim().toLowerCase() === "pending")
    .map((row) => ({
      employee: row?.employee || "",
      leaveType: row?.leaveType || "",
      status: row?.status || "",
    }));

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const incrementsLastYear = salaryHistoryRows
    .filter((row) => {
      const effectiveFrom = String(row?.effectiveFrom || "").trim();
      if (!effectiveFrom) return false;
      const parsed = new Date(effectiveFrom);
      return !Number.isNaN(parsed.getTime()) && parsed >= oneYearAgo;
    })
    .map((row) => ({
      employeeName: row?.employeeName || "",
      effectiveFrom: row?.effectiveFrom || "",
      incrementType: row?.incrementType || "",
      incrementValue: row?.incrementValue || "",
      incrementAmount: row?.incrementAmount || "",
      newSalary: row?.newSalary || "",
    }));

  const todayFollowUps = followUps
    .filter((row) => String(row?.dueDate || "").trim() === todayIso)
    .map((row) => ({
      subject: row?.subject || "",
      relatedTo: row?.relatedTo || "",
      owner: row?.owner || "",
      status: row?.status || "",
    }));

  const upcomingMeetings = meetings
    .filter((row) => String(row?.meetingDate || "").trim() >= todayIso)
    .slice()
    .sort((a, b) => `${a?.meetingDate || ""} ${a?.meetingTime || ""}`.localeCompare(`${b?.meetingDate || ""} ${b?.meetingTime || ""}`))
    .slice(0, 8)
    .map((row) => ({
      title: row?.title || "",
      relatedTo: row?.relatedTo || "",
      meetingDate: row?.meetingDate || "",
      meetingTime: row?.meetingTime || "",
      owner: row?.owner || "",
      status: row?.status || "",
      meetingMode: row?.meetingMode || "",
    }));

  const recentDiscussions = activities
    .slice()
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))
    .slice(0, 6)
    .map((row) => ({
      activityType: row?.activityType || "",
      relatedTo: row?.relatedTo || "",
      date: row?.date || "",
      owner: row?.owner || "",
      notes: row?.notes || "",
    }));

  const billPendingInvoices = invoices
    .filter((row) => !["paid", "cancelled"].includes(String(row?.status || "").trim().toLowerCase()))
    .slice(0, 10)
    .map((row) => ({
      invoiceNumber: row?.invoiceNumber || row?.id || "",
      customerName: row?.customerName || row?.company || "",
      status: row?.status || "",
      total: row?.total || 0,
      issueDate: row?.issueDate || row?.date || "",
    }));

  return {
    today: todayIso,
    quickStats,
    subscriptionsCount: Array.isArray(subscriptions) ? subscriptions.length : 0,
    hr: {
      todaysLeaveEmployees,
      pendingLeaves,
      incrementsLastYear,
    },
    crm: {
      todayFollowUps,
      upcomingMeetings,
      recentDiscussions,
    },
    ticketing: {
      totalTicketsCount: allTickets.length,
      openTickets: openTickets
        .slice(0, 10)
        .map((row) => ({
          ticketId: row?.id || "",
          title: row?.subject || row?.title || "",
          status: row?.status || "",
          priority: row?.priority || "",
        })),
    },
    accounts: {
      billPendingInvoices,
    },
  };
}

function buildUserInitial(user = {}) {
  const fullName = `${String(user?.first_name || "").trim()} ${String(user?.last_name || "").trim()}`.trim();
  if (fullName) {
    return fullName.slice(0, 1).toUpperCase();
  }
  const username = String(user?.username || "").trim();
  if (username) {
    return username.slice(0, 1).toUpperCase();
  }
  const email = String(user?.email || "").trim();
  if (email) {
    return email.slice(0, 1).toUpperCase();
  }
  return "U";
}

function UserChatAvatar({ photoUrl = "", label = "U" }) {
  return (
    <div className="ba-assistant__user-avatar">
      {photoUrl ? (
        <img src={photoUrl} alt="Profile" className="ba-assistant__user-avatar-img" />
      ) : (
        <span className="ba-assistant__user-avatar-fallback">{label}</span>
      )}
    </div>
  );
}

async function requestAssistantTts(text) {
  const response = await fetch("/api/business-autopilot/openai/tts", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      detail = data?.detail || data?.message || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return response.blob();
}

function buildLiveAssistantContext() {
  return buildAssistantContext();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildAssistantWelcomeMessage({ historyDate, agentName, hasApiKey }) {
  return {
    id: `assistant-welcome-${historyDate}`,
    role: "assistant",
    text: hasApiKey
      ? `Hi, I am ${agentName}. Ask me about increments in the last year, today's leaves, CRM follow-ups, or meeting schedules.`
      : `Hi, I am ${agentName}. OpenAI API key is not configured yet. Click the setup link below to complete your OpenAI connection.`,
  };
}

function buildHistorySignature(rows = []) {
  return JSON.stringify(
    (Array.isArray(rows) ? rows : []).map((item) => ({
      id: String(item?.id || "").trim(),
      role: String(item?.role || "").trim(),
      text: String(item?.text || "").trim(),
    }))
  );
}

export default function BusinessAutopilotAssistantWidget({
  enabled = false,
  currentSectionKey = "dashboard",
  pageMode = false,
}) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    loading: true,
    enabled: false,
    hasApiKey: false,
    agent_name: "Work Zilla AI Assistant",
    voice_gender: "female",
    wake_word_enabled: false,
    wake_phrase: "",
    silence_gap_seconds: 5,
    scope: null,
  });
  const [currentUser, setCurrentUser] = useState({
    photoUrl: "",
    label: "U",
  });
  const [open, setOpen] = useState(Boolean(pageMode));
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [historyDate, setHistoryDate] = useState(getTodayIso());
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceStage, setVoiceStage] = useState("");
  const [wakeModeActive, setWakeModeActive] = useState(false);
  const [wakeListeningEnabled, setWakeListeningEnabled] = useState(false);
  const [showAssistantHints, setShowAssistantHints] = useState(false);
  const [wakeDebugText, setWakeDebugText] = useState("");
  const listRef = useRef(null);
  const todayIso = getTodayIso();
  const isViewingToday = historyDate === todayIso;
  const speechPlayback = useSpeechPlayback();
  const wakeTriggeredRef = useRef(false);
  const wakeDetectorBusyRef = useRef(false);
  const wakeAckCountRef = useRef(0);
  const wakeTranscriptBufferRef = useRef("");
  const wakeArmedRef = useRef(true);
  const voiceTurnPendingWakeResetRef = useRef(false);
  const historyLoadedRef = useRef(false);
  const historyPersistTimerRef = useRef(null);
  const historyLoadRequestRef = useRef(0);
  const historySignatureRef = useRef("");
  const messagesRef = useRef([]);

  useEffect(() => {
    messagesRef.current = Array.isArray(messages) ? messages : [];
  }, [messages]);

  async function playAssistantCue(text, fallbackDelay = 800) {
    try {
      const audioBlob = await requestAssistantTts(text);
      const played = await speechPlayback.playBlob(audioBlob);
      if (!played) {
        speechPlayback.speak(text, { voiceGender: settings.voice_gender });
      }
    } catch {
      speechPlayback.speak(text, { voiceGender: settings.voice_gender });
    }
    await wait(fallbackDelay);
  }

  function appendAssistantMessage(text) {
    const messageText = String(text || "").trim();
    if (!messageText) {
      return;
    }
    const nextMessages = [
      ...(Array.isArray(messagesRef.current) ? messagesRef.current : []),
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: messageText,
      },
    ];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }

  async function disableWakeListeningWithGoodbye(goodbyeText = `${settings.agent_name || "Maya"} signing off. Goodbye!`) {
    setWakeListeningEnabled(false);
    stopAllVoiceListening({ preserveManualToggle: true });
    appendAssistantMessage(goodbyeText);
    setVoiceStage("Speaking");
    await playAssistantCue(goodbyeText, 900);
  }

  async function startWakeCommandCapture() {
    wakeAckCountRef.current += 1;
    setVoiceStage("Wake Word Detected");
    if (audioRecorder.supported) {
      setVoiceStage("Recording");
      await audioRecorder.startRecording({ stopAfterSilenceMs: (settings.silence_gap_seconds || 5) * 1000 });
      return;
    }
    setVoiceStage("Listening");
    speech.startListening();
  }

  async function handleWakeTranscript(rawText = "") {
    const currentText = String(rawText || "").trim();
    const combinedText = [wakeTranscriptBufferRef.current, currentText].filter(Boolean).join(" ").trim();
    if (currentText) {
      setWakeDebugText(`Wake heard: ${currentText}`);
    }
    const wakeMatch = extractWakeCommand(combinedText || currentText, settings);
    if (!wakeMatch.triggered || wakeTriggeredRef.current) {
      wakeTranscriptBufferRef.current = currentText.slice(-120);
      return false;
    }
    wakeTranscriptBufferRef.current = "";
    wakeTriggeredRef.current = true;
    wakeArmedRef.current = false;
    voiceTurnPendingWakeResetRef.current = true;
    setWakeModeActive(false);
    setVoiceDraft("");
    if (wakeMatch.command && wakeMatch.command.length >= 2) {
      setPrompt(wakeMatch.command);
      setVoiceStage("Question Ready");
      await handleSubmit(null, wakeMatch.command);
      return true;
    }
    await startWakeCommandCapture();
    return true;
  }

  async function persistSharedHistory(nextMessages = [], targetDate = historyDate) {
    if (!settings.enabled) {
      return;
    }
    const normalizedMessages = Array.isArray(nextMessages) ? nextMessages : [];
    const signature = buildHistorySignature(normalizedMessages);
    historySignatureRef.current = signature;
    await apiFetch("/api/business-autopilot/openai/chat-history", {
      method: "PUT",
      body: JSON.stringify({
        date: targetDate,
        messages: normalizedMessages.map((item) => ({
          id: item?.id || "",
          role: item?.role || "",
          text: item?.text || "",
        })),
      }),
    });
  }

  async function loadSharedHistory(targetDate = historyDate, { silent = false } = {}) {
    const requestId = Date.now();
    historyLoadRequestRef.current = requestId;
    const data = await apiFetch(`/api/business-autopilot/openai/chat-history?date=${encodeURIComponent(targetDate)}`);
    if (historyLoadRequestRef.current !== requestId) {
      return;
    }
    const serverMessages = Array.isArray(data?.messages) ? data.messages : [];
    const resolvedMessages = serverMessages.length
      ? serverMessages
      : [buildAssistantWelcomeMessage({
        historyDate: targetDate,
        agentName: settings.agent_name,
        hasApiKey: settings.hasApiKey,
      })];
    const nextSignature = buildHistorySignature(resolvedMessages);
    historyLoadedRef.current = true;
    if (nextSignature !== historySignatureRef.current) {
      historySignatureRef.current = nextSignature;
      messagesRef.current = resolvedMessages;
      setMessages(resolvedMessages);
    }
    if (!serverMessages.length && !silent) {
      await persistSharedHistory(resolvedMessages, targetDate);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setSettings({
        loading: false,
        enabled: false,
        hasApiKey: false,
        agent_name: "Work Zilla AI Assistant",
        voice_gender: "female",
        wake_word_enabled: false,
        wake_phrase: "",
        silence_gap_seconds: 5,
        scope: null,
      });
      return;
    }
    let active = true;
    async function loadSettings() {
      try {
        const [data, profile] = await Promise.all([
          apiFetch("/api/business-autopilot/openai/settings"),
          apiFetch("/api/dashboard/profile"),
        ]);
        if (!active) return;
        setSettings({
          loading: false,
          enabled: Boolean(data?.enabled || data?.has_api_key),
          hasApiKey: Boolean(data?.has_api_key),
          agent_name: data?.agent_name || "Work Zilla AI Assistant",
          voice_gender: data?.voice_gender || "female",
          wake_word_enabled: Boolean(data?.wake_word_enabled),
          wake_phrase: data?.wake_phrase || "",
          silence_gap_seconds: Number(data?.silence_gap_seconds || 5) || 5,
          scope: data?.scope || null,
        });
        setCurrentUser({
          photoUrl: profile?.user?.profile_photo_url || "",
          label: buildUserInitial(profile?.user || {}),
        });
      } catch {
        if (active) {
          setSettings({
            loading: false,
            enabled: false,
            hasApiKey: false,
            agent_name: "Work Zilla AI Assistant",
            voice_gender: "female",
            wake_word_enabled: false,
            wake_phrase: "",
            silence_gap_seconds: 5,
            scope: null,
          });
          setCurrentUser({ photoUrl: "", label: "U" });
        }
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!settings.enabled) {
      setOpen(false);
      historyLoadedRef.current = false;
      historySignatureRef.current = "";
      return;
    }
    historyLoadedRef.current = false;
    loadSharedHistory(historyDate).catch(() => {
      const fallbackMessages = [buildAssistantWelcomeMessage({
        historyDate,
        agentName: settings.agent_name,
        hasApiKey: settings.hasApiKey,
      })];
      historySignatureRef.current = buildHistorySignature(fallbackMessages);
      historyLoadedRef.current = true;
      setMessages(fallbackMessages);
    });
  }, [historyDate, settings.agent_name, settings.enabled, settings.hasApiKey]);

  useEffect(() => {
    if (!settings.enabled || !messages.length || !historyLoadedRef.current) {
      return;
    }
    const nextSignature = buildHistorySignature(messages);
    if (nextSignature === historySignatureRef.current) {
      return;
    }
    if (historyPersistTimerRef.current) {
      window.clearTimeout(historyPersistTimerRef.current);
    }
    historyPersistTimerRef.current = window.setTimeout(() => {
      historyPersistTimerRef.current = null;
      persistSharedHistory(messages, historyDate).catch(() => {
        // Ignore sync failures; user can continue chatting and polling can recover later.
      });
    }, 250);
  }, [historyDate, messages, settings.enabled]);

  useEffect(() => () => {
    if (historyPersistTimerRef.current) {
      window.clearTimeout(historyPersistTimerRef.current);
      historyPersistTimerRef.current = null;
    }
  }, []);

  const speech = useBrowserSpeechInput({
    lang: detectScriptLanguage(prompt || buildWakePhrase(settings)),
    onInterimText: (text) => {
      setVoiceStage("Listening");
      setVoiceDraft(text);
      setPrompt(text);
    },
    onFinalText: (text) => {
      const finalText = String(text || "").trim();
      setVoiceDraft("");
      if (!finalText) {
        setVoiceStage("");
        return;
      }
      setVoiceStage("Question Ready");
      setPrompt(finalText);
      handleSubmit(null, finalText);
    },
  });

  const wakeSpeech = useBrowserSpeechInput({
    lang: detectScriptLanguage(buildWakePhrase(settings)),
  });

  const audioRecorder = useAudioRecorder({
    onRecorded: async (blob) => {
      if (!settings.hasApiKey || !isViewingToday) {
        return;
      }
      setVoiceStage("Done Recording");
      await playAssistantCue("Okay", 650);
      setVoiceBusy(true);
      setVoiceStage("Transcribing");
      try {
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note.${extension}`, { type: blob.type || "audio/webm" });
        const formData = new FormData();
        formData.append("audio", file);
        formData.append("current_section", currentSectionKey || "dashboard");
        formData.append("preferred_input_language", "ta-IN");
        formData.append("speech_context", `Work Zilla Business Autopilot. Assistant name is ${settings.agent_name || "Assistant"}. Common business terms: CRM, HRM, leads, lead, deals, meetings, attendance, payroll, billing, invoice, sales, follow-up, task, overtime, users, employee count, total users, total leads, motham leads, yevalo leads, evlo leads, ${settings.agent_name || "Assistant"}.`);
        const transcript = await apiFetch("/api/business-autopilot/openai/transcribe", {
          method: "POST",
          body: formData,
        });
        const finalText = String(transcript?.text || "").trim();
        if (!finalText) {
          setVoiceStage("");
          return;
        }
        setVoiceDraft("");
        setVoiceStage("Question Ready");
        setPrompt(finalText);
        await handleSubmit(null, finalText);
      } catch (error) {
        setVoiceStage("");
        const rawMessage = String(error?.message || "").trim();
        const friendlyMessage = rawMessage.toLowerCase().includes("audio duration")
          ? "Voice romba short-a record aayiduchu. Konjam longer-a pesi try pannunga."
          : rawMessage || "Unable to transcribe voice right now.";
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            text: friendlyMessage,
          },
        ]);
      } finally {
        setVoiceBusy(false);
      }
    },
  });

  const wakeDetector = useWakeWordDetector({
    enabled: Boolean(
      (pageMode || open)
      && settings.hasApiKey
      && isViewingToday
      && settings.wake_word_enabled
      && !sending
      && !voiceBusy
      && !audioRecorder.recording
      && !speechPlayback.speaking
      && !wakeTriggeredRef.current
      && wakeArmedRef.current
    ),
    chunkMs: 3200,
    onChunk: async (blob) => {
      if (wakeDetectorBusyRef.current || wakeTriggeredRef.current) {
        return;
      }
      wakeDetectorBusyRef.current = true;
      try {
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `wake-listener.${extension}`, { type: blob.type || "audio/webm" });
        const formData = new FormData();
        const wakeAliases = buildWakeAliases(settings).slice(0, 12);
        formData.append("audio", file);
        formData.append("allow_empty", "1");
        formData.append("current_section", currentSectionKey || "dashboard");
        formData.append("speech_context", `Assistant name: ${settings.agent_name || "Maya"}. Treat audio as a wake trigger only when human speech starts with the assistant name or a wake phrase such as ${wakeAliases.join(", ")}. Ignore fan noise, wind noise, background office talk, and any speech that does not begin with the assistant name. Common commands include CRM leads, HR attendance, billing summary, meetings.`);
        const transcript = await apiFetch("/api/business-autopilot/openai/transcribe", {
          method: "POST",
          body: formData,
        });
        const text = String(transcript?.text || "").trim();
        if (text) {
          setWakeDebugText(`Wake heard: ${text}`);
          await handleWakeTranscript(text);
        }
      } catch {
        // Ignore wake detector errors so background listening can continue.
      } finally {
        wakeDetectorBusyRef.current = false;
      }
    },
  });

  useEffect(() => {
    if (!(pageMode || open) || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, pageMode]);

  useEffect(() => {
    if (!(pageMode || open) || !settings.enabled || !settings.hasApiKey) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (sending || voiceBusy || audioRecorder.recording) {
        return;
      }
      loadSharedHistory(historyDate, { silent: true }).catch(() => {
        // Ignore polling failures.
      });
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [audioRecorder.recording, historyDate, open, pageMode, sending, settings.enabled, settings.hasApiKey, voiceBusy]);

  useEffect(() => {
    if (!(pageMode || open)) {
      setShowAssistantHints(false);
      return undefined;
    }
    setShowAssistantHints(true);
    const timer = window.setTimeout(() => {
      setShowAssistantHints(false);
    }, 30000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, pageMode]);

  async function handleSubmit(event, seedQuestion = "") {
    event?.preventDefault?.();
    if (!settings.hasApiKey || !isViewingToday) {
      return;
    }
    const question = String(seedQuestion || prompt || "").trim();
    if (!question || sending) return;
    if (isWakeListeningStopCommand(question, settings)) {
      setPrompt("");
      setVoiceDraft("");
      await disableWakeListeningWithGoodbye("Goodbye! Wake listening is now turned off.");
      return;
    }
    setPrompt("");
    setVoiceStage("Sending");
    const userMessage = { id: `user-${Date.now()}`, role: "user", text: question };
    const baseMessages = Array.isArray(messagesRef.current) ? messagesRef.current : [];
    const nextMessages = [...baseMessages, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setSending(true);
    try {
      const data = await apiFetch("/api/business-autopilot/openai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: question,
          current_section: currentSectionKey,
          local_context: buildLiveAssistantContext(),
          recent_messages: baseMessages.slice(-12).map((item) => ({
            role: item?.role || "",
            text: item?.text || "",
          })),
        }),
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: data?.reply || "No response received.",
      };
      const resolvedMessages = [...nextMessages, assistantMessage];
      messagesRef.current = resolvedMessages;
      setMessages(resolvedMessages);
      setVoiceStage("Reply Ready");
      if (data?.scope) {
        setSettings((prev) => ({
          ...prev,
          scope: data.scope,
          agent_name: data?.agent_name || prev.agent_name,
        }));
      }
      try {
        const replyText = data?.reply || "No response received.";
        const replySpeechText = String(data?.tts_text || replyText || "").trim() || replyText;
        const audioBlob = await requestAssistantTts(replySpeechText);
        const played = await speechPlayback.playBlob(audioBlob);
        if (!played) {
          speechPlayback.speak(replySpeechText, { voiceGender: settings.voice_gender });
        }
      } catch {
        speechPlayback.speak(String(data?.tts_text || data?.reply || "No response received."), { voiceGender: settings.voice_gender });
      }
    } catch (error) {
      setVoiceStage("");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: error?.message || "Unable to get assistant response right now.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (sending || voiceBusy || audioRecorder.recording || speechPlayback.speaking) {
      return;
    }
    if (!voiceTurnPendingWakeResetRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      wakeTriggeredRef.current = false;
      wakeTranscriptBufferRef.current = "";
      wakeArmedRef.current = true;
      voiceTurnPendingWakeResetRef.current = false;
      setWakeModeActive(false);
      setVoiceStage("");
    }, 900);
    return () => {
      window.clearTimeout(timer);
    };
  }, [audioRecorder.recording, sending, speechPlayback.speaking, voiceBusy]);

  useEffect(() => {
    if (open) {
      return;
    }
    speech.stopListening();
    wakeSpeech.stopListening();
    audioRecorder.stopRecording();
    speechPlayback.stop();
    wakeTriggeredRef.current = false;
    wakeTranscriptBufferRef.current = "";
    setWakeModeActive(false);
    setWakeDebugText("");
    setVoiceStage("");
  }, [audioRecorder, open, speech, speechPlayback, wakeSpeech]);

  useEffect(() => {
    if (!open || isViewingToday) {
      return;
    }
    speech.stopListening();
    wakeSpeech.stopListening();
    audioRecorder.stopRecording();
    speechPlayback.stop();
    wakeTriggeredRef.current = false;
    wakeTranscriptBufferRef.current = "";
    setWakeModeActive(false);
    setWakeDebugText("");
    setVoiceStage("");
  }, [audioRecorder, isViewingToday, open, speech, speechPlayback, wakeSpeech]);

  useEffect(() => {
    if (!open || settings.hasApiKey) {
      return;
    }
    speech.stopListening();
    wakeSpeech.stopListening();
    audioRecorder.stopRecording();
    speechPlayback.stop();
    wakeTriggeredRef.current = false;
    wakeTranscriptBufferRef.current = "";
    setWakeModeActive(false);
    setWakeDebugText("");
    setVoiceStage("");
  }, [audioRecorder, open, settings.hasApiKey, speech, speechPlayback, wakeSpeech]);

  useEffect(() => {
    if (!settings.wake_word_enabled) {
      setWakeListeningEnabled(false);
    }
  }, [settings.wake_word_enabled]);

  useEffect(() => {
    if (speechPlayback.speaking) {
      setVoiceStage("Speaking");
      return;
    }
    setVoiceStage((current) => (current === "Speaking" || current === "Reply Ready" ? "" : current));
  }, [speechPlayback.speaking]);

  useEffect(() => {
    const canWakeListen = Boolean(
      (pageMode || open)
      && settings.hasApiKey
      && isViewingToday
      && settings.wake_word_enabled
      && wakeListeningEnabled
      && wakeDetector.supported
      && (audioRecorder.supported || speech.supported)
      && !sending
      && !voiceBusy
      && !audioRecorder.recording
      && !speechPlayback.speaking
      && !speech.listening
    );
    if (!canWakeListen) {
      wakeDetector.stopDetector();
      setWakeModeActive(false);
      return;
    }
    setWakeModeActive(wakeDetector.running);
    if (wakeDetector.running) {
      setVoiceStage("Wake Listening");
    }
  }, [
    audioRecorder.recording,
    audioRecorder.supported,
    isViewingToday,
    open,
    pageMode,
    sending,
    settings.hasApiKey,
    settings.wake_word_enabled,
    wakeListeningEnabled,
    speech.listening,
    speechPlayback.speaking,
    voiceBusy,
    wakeDetector.running,
    wakeDetector.supported,
  ]);

  function openOpenAiSettings() {
    if (typeof window === "undefined") return;
    window.location.href = "/app/business-autopilot/profile?tab=openAiApi";
  }

  function clearChatHistory() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Are you sure you want to delete this chat history?");
      if (!confirmed) {
        return;
      }
    }
    apiFetch(`/api/business-autopilot/openai/chat-history?date=${encodeURIComponent(historyDate)}`, {
      method: "DELETE",
    }).catch(() => null);
    const resetMessages = [buildAssistantWelcomeMessage({
      historyDate,
      agentName: settings.agent_name,
      hasApiKey: settings.hasApiKey,
    })];
    historySignatureRef.current = "";
    historyLoadedRef.current = true;
    messagesRef.current = resetMessages;
    setMessages(resetMessages);
  }

  function handleHistoryDateChange(event) {
    const nextDate = String(event.target.value || "").trim();
    if (!nextDate) {
      return;
    }
    setHistoryDate(nextDate);
    setShowHistoryPicker(false);
  }

  async function primeMicrophoneAccess() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Ignore priming failures; normal mic flows will still show their own errors.
    }
  }

  async function handleToggleAssistant() {
    if (pageMode) {
      return;
    }
    setOpen((prev) => !prev);
  }

  function stopAllVoiceListening({ preserveManualToggle = false } = {}) {
    wakeSpeech.stopListening();
    wakeDetector.stopDetector();
    speech.stopListening();
    audioRecorder.stopRecording();
    wakeTriggeredRef.current = false;
    wakeTranscriptBufferRef.current = "";
    wakeArmedRef.current = true;
    voiceTurnPendingWakeResetRef.current = false;
    if (!preserveManualToggle) {
      setWakeListeningEnabled(Boolean(settings.wake_word_enabled));
    }
    setWakeModeActive(false);
    setWakeDebugText("");
    setVoiceDraft("");
    setVoiceStage("");
  }

  if (!enabled || settings.loading || !settings.enabled || (!pageMode && dismissed)) {
    return null;
  }

  const panelOpen = pageMode || open;
  const scope = settings.scope || {};
  const quickQuestions = [];
  if (scope.can_access_hr) {
    quickQuestions.push("Who got increments in the last one year?");
    quickQuestions.push("Who has overtime this month?");
  }
  if (scope.can_access_crm) {
    quickQuestions.push("What meetings are scheduled today?");
    quickQuestions.push("Show my open leads summary.");
  }
  if (scope.can_access_accounts || scope.can_access_billing) {
    quickQuestions.push("Give today's billing or sales summary.");
  }
  if (!quickQuestions.length) {
    quickQuestions.push("What business data can I access?");
  }
  const assistantSubtitle = scope?.label
    ? `${scope.label} AI Assistant`
    : "Business Autopilot AI Assistant";
  const hasUserStartedChat = messages.some((item) => item.role === "user");
  const composerPlaceholder = scope.can_access_crm && scope.can_access_hr
    ? "Ask about HRM, CRM, attendance, meetings, or sales..."
    : scope.can_access_hr
      ? "Ask about attendance, increments, overtime, or payroll summaries..."
      : scope.can_access_crm
        ? "Ask about leads, meetings, deals, or sales summary..."
        : "Ask about your allowed business data...";
  const accessNote = currentSectionKey && !scope.allowed_sections?.includes(currentSectionKey) && currentSectionKey !== "dashboard"
    ? "Current page module is outside your assistant scope, so replies stay within your allowed business access."
    : "";
  const wakePhraseLabel = buildWakePhrase(settings);
  const wakeModeReady = Boolean(
    panelOpen
    && settings.wake_word_enabled
    && settings.hasApiKey
    && wakeDetector.supported
    && (audioRecorder.supported || speech.supported)
  );
  const wakeListeningActive = wakeModeActive || wakeDetector.running;
  const wakeListeningToggleActive = Boolean(
    settings.wake_word_enabled
    && wakeListeningEnabled
    && settings.hasApiKey
    && isViewingToday
  );
  const showVoiceVisualizer = voiceStage === "Wake Word Detected" || audioRecorder.recording || voiceBusy || sending || speechPlayback.speaking;
  const voiceVisualizerMode = audioRecorder.recording
    ? "recording"
    : voiceStage === "Wake Word Detected"
      ? "listening"
      : voiceBusy
        ? "transcribing"
        : sending
          ? "sending"
          : speechPlayback.speaking
            ? "speaking"
            : "idle";
  const latestAssistantMessage = [...messages].reverse().find((item) => item.role === "assistant" && String(item.text || "").trim());
  const latestAssistantEmotion = latestAssistantMessage ? getAiEmotionFromText(latestAssistantMessage.text) : (settings.hasApiKey ? "happy" : "neutral");
  const headerAssistantEmotion = sending ? "thinking" : latestAssistantEmotion;
  const fullPagePath = "/assistant";
  const voiceStatusNote = (wakeListeningActive && showAssistantHints)
    ? `Wake mode ready. Say "${wakePhraseLabel}" or "Hey ${settings.agent_name || "Maya"}" to start recording.`
    : voiceStage === "Wake Word Detected"
      ? `Wake word detected. ${audioRecorder.recording ? "Recording started." : "Processing your command..."}`
    : audioRecorder.recording
    ? `Recording voice... auto-sending after ${settings.silence_gap_seconds || 5} seconds silence.`
    : voiceBusy
      ? "Transcribing voice note..."
      : speechPlayback.speaking
        ? "AI is speaking..."
      : audioRecorder.error
        ? `Voice input unavailable: ${audioRecorder.error}.`
        : speech.error
    ? `Voice input unavailable: ${speech.error}.`
    : speech.listening
      ? "Listening... speak now."
      : (wakeModeReady && !wakeListeningToggleActive && showAssistantHints)
        ? `Wake mode is off. Turn on Wake first, then start each voice query with "${settings.agent_name || "Maya"}".`
      : voiceDraft
        ? `Heard: ${voiceDraft}`
        : "";
  const voiceTimelineSteps = [
    { key: "Wake Listening", active: wakeListeningActive || voiceStage === "Wake Listening", done: !wakeListeningActive && ["Wake Word Detected", "Recording", "Transcribing", "Question Ready", "Sending", "Reply Ready", "Speaking"].includes(voiceStage) },
    { key: "Recording", active: audioRecorder.recording, done: !audioRecorder.recording && ["Transcribing", "Question Ready", "Sending", "Reply Ready", "Speaking"].includes(voiceStage) },
    { key: "Transcribing", active: voiceBusy || voiceStage === "Transcribing", done: !voiceBusy && ["Question Ready", "Sending", "Reply Ready", "Speaking"].includes(voiceStage) },
    { key: "Sending", active: sending || voiceStage === "Sending", done: !sending && ["Reply Ready", "Speaking"].includes(voiceStage) },
    { key: "Speaking", active: speechPlayback.speaking || voiceStage === "Speaking", done: !speechPlayback.speaking && voiceStage === "Reply Ready" },
  ];

  return (
    <div className={`ba-assistant ${panelOpen ? "is-open" : ""} ${pageMode ? "ba-assistant--page" : ""}`}>
      {panelOpen ? (
        <div className="ba-assistant__panel">
          <div className="ba-assistant__header">
            <div className="ba-assistant__header-copy">
              <AiAvatar emotion={headerAssistantEmotion} size={40} />
              <div>
              <div className="ba-assistant__title">{settings.agent_name}</div>
              <div className="ba-assistant__subtitle">{assistantSubtitle}</div>
              </div>
            </div>
            <div className="ba-assistant__header-actions">
              {!pageMode ? (
                <Link
                  className="ba-assistant__icon-link saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                  to={fullPagePath}
                  aria-label="Open full page chat"
                  onClick={() => setOpen(false)}
                >
                  <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
                </Link>
              ) : null}
              <button
                type="button"
                className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                aria-label={pageMode ? "Close full page chat" : "Close assistant"}
                onClick={() => {
                  if (pageMode) {
                    navigate("/");
                    return;
                  }
                  setOpen(false);
                }}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="ba-assistant__date-strip">
            {isViewingToday ? "Today chat" : `Viewing ${formatDateLikeValue(historyDate, historyDate)} history`}
          </div>
          {accessNote ? <div className="ba-assistant__date-strip">{accessNote}</div> : null}
          {!hasUserStartedChat ? (
            <div className="ba-assistant__chips">
              {quickQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="ba-assistant__chip"
                  onClick={(event) => handleSubmit(event, item)}
                  disabled={!settings.hasApiKey || !isViewingToday}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <div className={`ba-assistant__messages ${pageMode ? "ba-assistant__messages--full" : ""}`} ref={listRef}>
            {messages.map((item) => (
              <div
                key={item.id}
                className={`ba-assistant__message ba-assistant__message--${item.role}`}
              >
                {item.role === "assistant" ? (
                  <AiAvatar emotion={getAiEmotionFromText(item.text)} size={42} />
                ) : (
                  <UserChatAvatar photoUrl={currentUser.photoUrl} label={currentUser.label} />
                )}
                <div className={`ba-assistant__bubble ba-assistant__bubble--${item.role}`}>
                  {item.text}
                  {item.role === "assistant" ? (
                    <div className="ba-assistant__reaction">
                      {getAiEmotionEmoji(getAiEmotionFromText(item.text))} {settings.agent_name} Response
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="ba-assistant__message ba-assistant__message--assistant">
                <AiAvatar emotion="thinking" size={42} />
                <div className="ba-assistant__bubble ba-assistant__bubble--assistant">
                  Thinking...
                  <div className="ba-assistant__reaction">{getAiEmotionEmoji("thinking")} {settings.agent_name} Response</div>
                </div>
              </div>
            ) : null}
          </div>
          {settings.hasApiKey ? (
            <form className="ba-assistant__composer" onSubmit={handleSubmit}>
              {!isViewingToday ? (
                <div className="ba-assistant__setup-note">
                  Old chat history is read-only. Select today in <strong>Chat History</strong> to continue chatting.
                </div>
              ) : null}
              <textarea
                className="form-control"
                rows={2}
                value={prompt}
                onChange={(event) => {
                  setVoiceDraft("");
                  setPrompt(event.target.value);
                }}
                placeholder={composerPlaceholder}
                disabled={!isViewingToday || sending}
              />
              {wakeModeReady && showAssistantHints ? (
                <div className="ba-assistant__setup-note">
                  Wake word mode is manual. Turn on <strong>Wake</strong> first, then start every voice query with <strong>{settings.agent_name || "Maya"}</strong>, <strong>{wakePhraseLabel}</strong>, or <strong>Hey {settings.agent_name || "Maya"}</strong>. Recording stops only after {settings.silence_gap_seconds || 5} seconds of silence.
                </div>
              ) : null}
              {wakeDebugText ? <div className="ba-assistant__setup-note">{wakeDebugText}</div> : null}
              {voiceStatusNote ? <div className="ba-assistant__setup-note">{voiceStatusNote}</div> : null}
              {showVoiceVisualizer ? (
                <div className={`ba-assistant__voice-visualizer ba-assistant__voice-visualizer--${voiceVisualizerMode}`}>
                  <div className="ba-assistant__voice-visualizer-head">
                    <div>
                      <div className="ba-assistant__voice-visualizer-title">
                        {audioRecorder.recording ? "Recording In Progress" : voiceStage === "Wake Word Detected" ? "Wake Listening Active" : voiceBusy ? "Transcribing Voice" : sending ? "Sending Voice Query" : "Speaking Reply"}
                      </div>
                      <div className="ba-assistant__voice-visualizer-subtitle">
                        {audioRecorder.recording
                          ? `Speak now. Auto-send happens after ${settings.silence_gap_seconds || 5} seconds silence.`
                          : voiceStage === "Wake Word Detected"
                            ? `Wake phrase heard. Speak now. If voice is silent for ${settings.silence_gap_seconds || 5} seconds, recording stops automatically.`
                            : voiceBusy
                              ? "Converting your voice into text."
                              : sending
                                ? "Sending your recognized command."
                                : "Assistant reply playback is active."}
                      </div>
                    </div>
                    {(wakeListeningActive || audioRecorder.recording || speech.listening) ? (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={stopAllVoiceListening}
                      >
                        Listen Stop
                      </button>
                    ) : null}
                  </div>
                  <div className="ba-assistant__voice-wave" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                      <span key={bar} className="ba-assistant__voice-wave-bar" />
                    ))}
                  </div>
                </div>
              ) : null}
              {(audioRecorder.recording || voiceBusy || sending || speechPlayback.speaking || voiceStage) ? (
                <div className="ba-assistant__voice-timeline" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {voiceTimelineSteps.map((step) => (
                    <span
                      key={step.key}
                      style={{
                        borderRadius: 999,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        border: "1px solid #cfeccc",
                        background: step.active ? "#d7f7cf" : step.done ? "#edf9e8" : "#f7faf7",
                        color: step.active ? "#178a2f" : step.done ? "#3d6f47" : "#6b7280",
                      }}
                    >
                      {step.active ? "..." : step.done ? "Done" : ""} {step.key}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="ba-assistant__composer-actions">
                <button
                  type="button"
                  className="ba-assistant__round-btn saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                  onClick={clearChatHistory}
                  title="Clear Chat"
                  data-wz-tooltip="Clear Chat"
                  aria-label="Clear Chat"
                >
                  <i className="bi bi-trash3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ba-assistant__round-btn saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                  onClick={() => setShowHistoryPicker((prev) => !prev)}
                  title="Chat History"
                  data-wz-tooltip="Chat History"
                  aria-label="Chat History"
                >
                  <i className="bi bi-calendar3" aria-hidden="true" />
                </button>
                {wakeModeReady ? (
                  <button
                    type="button"
                    className={`ba-assistant__wake-toggle saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center ${wakeListeningToggleActive ? "is-on" : "is-off"}`}
                    onClick={() => {
                      const nextEnabled = !wakeListeningEnabled;
                      setWakeListeningEnabled(nextEnabled);
                      if (!nextEnabled) {
                        stopAllVoiceListening({ preserveManualToggle: true });
                        return;
                      }
                      setWakeDebugText("");
                      setVoiceStage("Wake Listening");
                    }}
                    data-wz-tooltip={wakeListeningToggleActive ? "Disable Wake Listening" : "Enable Wake Listening"}
                    aria-label={wakeListeningToggleActive ? "Disable Wake Listening" : "Enable Wake Listening"}
                    disabled={!settings.hasApiKey || !isViewingToday}
                  >
                    <i className={`bi ${wakeListeningToggleActive ? "bi-ear-fill" : "bi-ear"}`} aria-hidden="true" />
                  </button>
                ) : null}
                <PushToTalkButton
                  supported={audioRecorder.supported || speech.supported}
                  listening={audioRecorder.recording || speech.listening || voiceBusy}
                  disabled={!settings.hasApiKey || !isViewingToday || sending || voiceBusy}
                  className="ba-assistant__round-btn saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                  title={audioRecorder.recording || speech.listening || voiceBusy ? "Release to send voice" : "Hold to talk"}
                  tooltip={audioRecorder.recording || speech.listening || voiceBusy ? "Release to send voice" : "Hold to talk"}
                  ariaLabel={audioRecorder.recording || speech.listening || voiceBusy ? "Release to send voice" : "Hold to talk"}
                  onStart={() => {
                    wakeSpeech.stopListening();
                    setWakeModeActive(false);
                    wakeTriggeredRef.current = false;
                    setVoiceStage("Recording");
                    if (audioRecorder.supported) {
                      audioRecorder.startRecording();
                      return;
                    }
                    speech.startListening();
                  }}
                  onStop={() => {
                    if (audioRecorder.supported) {
                      audioRecorder.stopRecording();
                      return;
                    }
                    speech.stopListening();
                  }}
                />
                {speechPlayback.supported ? (
                  <button
                    type="button"
                    className="ba-assistant__round-btn saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                    onClick={() => {
                      if (speechPlayback.speaking) {
                        speechPlayback.stop();
                        setVoiceStage("");
                        return;
                      }
                      const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant" && String(item.text || "").trim());
                      if (latestAssistant) {
                        setVoiceStage("Speaking");
                        requestAssistantTts(latestAssistant.text)
                          .then((blob) => speechPlayback.playBlob(blob))
                          .catch(() => {
                            speechPlayback.speak(latestAssistant.text, { voiceGender: settings.voice_gender });
                          });
                      }
                    }}
                    title={speechPlayback.speaking ? "Stop Voice Reply" : "Replay Voice Reply"}
                    data-wz-tooltip={speechPlayback.speaking ? "Stop Voice Reply" : "Replay Voice Reply"}
                    aria-label={speechPlayback.speaking ? "Stop Voice Reply" : "Replay Voice Reply"}
                  >
                    <i className={`bi ${speechPlayback.speaking ? "bi-volume-mute" : "bi-volume-up"}`} aria-hidden="true" />
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary ba-assistant__send-btn" disabled={sending || !isViewingToday}>
                  Send
                </button>
              </div>
            </form>
          ) : (
            <div className="ba-assistant__composer">
              <div className="ba-assistant__setup-note">
                OpenAI API required.{" "}
                <button type="button" className="ba-assistant__setup-link" onClick={openOpenAiSettings}>
                  Click here
                </button>{" "}
                to configure it.
              </div>
            </div>
          )}
        </div>
      ) : null}
      {!panelOpen && !pageMode ? (
        <div className="ba-assistant__dock">
          <button
            type="button"
            className="ba-assistant__dismiss saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss AI Assistant"
            title="Dismiss AI Assistant"
            data-wz-tooltip="Dismiss AI Assistant"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
          <button type="button" className="ba-assistant__toggle" onClick={handleToggleAssistant}>
            <AiAvatar emotion={latestAssistantEmotion} size={38} />
            <span>{settings.agent_name || "AI Assistant"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
