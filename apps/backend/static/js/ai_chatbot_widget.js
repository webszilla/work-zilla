(function () {
  function getScriptElement() {
    if (document.currentScript) {
      return document.currentScript;
    }
    var scripts = document.querySelectorAll("script[data-widget-key]");
    return scripts.length ? scripts[scripts.length - 1] : null;
  }

  function generateId() {
    return "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function escapeText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function buildUI(mode) {
    var wrapper = document.createElement("div");
    wrapper.className = "wz-ai-chatbot wz-ai-chatbot--" + mode;
    wrapper.innerHTML = [
      '<div class="wz-ai-chatbot__panel wz-ai-chatbot__hidden">',
      '  <div class="wz-ai-chatbot__header">',
      '    <div class="wz-ai-chatbot__header-text">',
      '      <div class="wz-ai-chatbot__title">Chat</div>',
      '      <div class="wz-ai-chatbot__status">',
      '        <span class="wz-ai-chatbot__status-dot"></span>',
      '        <span class="wz-ai-chatbot__status-text">Online</span>',
      '      </div>',
      '    </div>',
      '    <button type="button" class="wz-ai-chatbot__sound" aria-label="Toggle sound">',
      '      <svg class="wz-ai-chatbot__sound-on" viewBox="0 0 24 24" aria-hidden="true">',
      '        <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12zm0-9a1 1 0 0 0-1 1 1 1 0 0 0 .5.87 8.5 8.5 0 0 1 0 14.26 1 1 0 0 0-.5.87 1 1 0 0 0 1 1 1 1 0 0 0 .5-.14 10.5 10.5 0 0 0 0-17.46 1 1 0 0 0-.5-.14z"/>',
      "      </svg>",
      '      <svg class="wz-ai-chatbot__sound-off" viewBox="0 0 24 24" aria-hidden="true">',
      '        <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12z"/>',
      '        <path d="M18.3 5.7a1 1 0 0 0-1.4 0l-10 10a1 1 0 0 0 1.4 1.4l10-10a1 1 0 0 0 0-1.4z"/>',
      "      </svg>",
      "    </button>",
      '    <button type="button" class="wz-ai-chatbot__close" aria-label="Close">A-</button>',
      "  </div>",
      '  <div class="wz-ai-chatbot__tabs">',
      '    <button type="button" class="wz-ai-chatbot__tab wz-ai-chatbot__tab--active" data-tab="sales">Sales</button>',
      '    <button type="button" class="wz-ai-chatbot__tab" data-tab="support">Support</button>',
      "  </div>",
      '  <div class="wz-ai-chatbot__prefill wz-ai-chatbot__hidden">',
      '    <div class="wz-ai-chatbot__prefill-title">Start a chat</div>',
      '    <form class="wz-ai-chatbot__prefill-form">',
      '      <input type="text" name="visitor_name" placeholder="Name" required />',
      '      <input type="email" name="visitor_email" placeholder="Email" required />',
      '      <div class="wz-ai-chatbot__phone-row">',
      '        <input type="text" name="visitor_phone_code" list="wz-country-codes" placeholder="+91" required />',
      '        <input type="tel" name="visitor_phone_number" placeholder="Mobile number" required />',
      "      </div>",
      '      <datalist id="wz-country-codes"></datalist>',
      '      <button type="submit" class="wz-ai-chatbot__prefill-submit">Start Chat</button>',
      "    </form>",
      '    <div class="wz-ai-chatbot__prefill-error wz-ai-chatbot__hidden">Please fill all fields.</div>',
      "  </div>",
      '  <div class="wz-ai-chatbot__messages"></div>',
      '  <div class="wz-ai-chatbot__enquiry wz-ai-chatbot__hidden">',
      '    <div class="wz-ai-chatbot__enquiry-title">Request a callback</div>',
      '    <form class="wz-ai-chatbot__enquiry-form">',
      '      <input type="text" name="name" placeholder="Name" required />',
      '      <input type="tel" name="phone" placeholder="Phone" required />',
      '      <input type="email" name="email" placeholder="Email (optional)" />',
      '      <textarea name="message" rows="3" placeholder="Message"></textarea>',
      '      <div class="wz-ai-chatbot__enquiry-actions">',
      '        <button type="button" class="wz-ai-chatbot__enquiry-back">Back to chat</button>',
      '        <button type="submit" class="wz-ai-chatbot__enquiry-submit">Submit</button>',
      '      </div>',
      '      <div class="wz-ai-chatbot__enquiry-success wz-ai-chatbot__hidden">Thanks! We will reach out soon.</div>',
      '      <div class="wz-ai-chatbot__enquiry-error wz-ai-chatbot__hidden">Please check your details and try again.</div>',
      '    </form>',
      '  </div>',
      '  <div class="wz-ai-chatbot__input">',
      '    <button type="button" class="wz-ai-chatbot__emoji" aria-label="Add emoji">😊</button>',
      '    <input type="text" placeholder="Type a message..." />',
      '    <button type="button">Send</button>',
      "  </div>",
      '  <div class="wz-ai-chatbot__emoji-picker wz-ai-chatbot__hidden" aria-hidden="true"></div>',
      '  <div class="wz-ai-chatbot__footer">',
      '    <div class="wz-ai-chatbot__brand"><a href="http://getworkzilla.com" target="_blank" rel="nofollow">AI Chatbot Powered by Work Zilla</a></div>',
      '    <button type="button" class="wz-ai-chatbot__callback">Request a callback</button>',
      '  </div>',
      "</div>",
      '<button type="button" class="wz-ai-chatbot__toggle" aria-label="Open chat">Chat</button>'
    ].join("");
    var mount = document.getElementById("wz-chat-page-root");
    if (mode === "page" && mount) {
      mount.innerHTML = "";
      mount.appendChild(wrapper);
    } else {
      document.body.appendChild(wrapper);
    }
    return wrapper;
  }

  function ensureStyles() {
    if (document.getElementById("wz-ai-chatbot-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "wz-ai-chatbot-style";
    style.textContent = [
      ".wz-ai-chatbot{position:fixed;right:20px;bottom:20px;font-family:Arial,Helvetica,sans-serif;z-index:9999;--wz-primary:#22c55e;--wz-accent:#2563eb;--wz-bg:#0f172a;--wz-panel:#111827;--wz-bot:#1f2937;--wz-text:#e2e8f0;}",
      ".wz-ai-chatbot--page{left:0;right:0;top:0;bottom:0;display:flex;align-items:stretch;justify-content:stretch;background:var(--wz-bg);}",
      ".wz-ai-chatbot__toggle{background:var(--wz-primary);color:#fff;border:none;border-radius:999px;padding:10px 16px;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,0.2);}",
      ".wz-ai-chatbot__panel{width:320px;height:420px;background:var(--wz-panel);color:var(--wz-text);border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 14px 30px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;margin-bottom:12px;}",
      ".wz-ai-chatbot--page .wz-ai-chatbot__panel{width:100%;height:100%;margin:0;border-radius:0;}",
      ".wz-ai-chatbot--page .wz-ai-chatbot__toggle{display:none;}",
      ".wz-ai-chatbot--page .wz-ai-chatbot__close{display:none;}",
      ".wz-ai-chatbot__hidden{display:none;}",
      ".wz-ai-chatbot__header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--wz-panel);border-bottom:1px solid rgba(255,255,255,0.08);position:sticky;top:0;z-index:2;}",
      ".wz-ai-chatbot__header-text{display:flex;flex-direction:column;gap:2px;}",
      ".wz-ai-chatbot__title{font-size:15px;font-weight:600;}",
            ".wz-ai-chatbot__status{display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(226,232,240,0.7);}",
      ".wz-ai-chatbot__status-dot{width:8px;height:8px;border-radius:50%;background-color:#22c55e;}",
      ".wz-ai-chatbot__status--online .wz-ai-chatbot__status-dot{background-color:#22c55e;}",
      ".wz-ai-chatbot__status--away .wz-ai-chatbot__status-dot{background-color:#f59e0b;}",
      ".wz-ai-chatbot__status--offline .wz-ai-chatbot__status-dot{background-color:#64748b;}",
      ".wz-ai-chatbot__close{background:transparent;border:none;color:#e2e8f0;font-size:18px;cursor:pointer;}",
      ".wz-ai-chatbot__sound{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:999px;padding:4px 8px;cursor:pointer;display:flex;align-items:center;justify-content:center;}",
      ".wz-ai-chatbot__sound svg{width:16px;height:16px;fill:currentColor;}",
      ".wz-ai-chatbot__sound .wz-ai-chatbot__sound-off{display:none;}",
      ".wz-ai-chatbot__sound--off .wz-ai-chatbot__sound-on{display:none;}",
      ".wz-ai-chatbot__sound--off .wz-ai-chatbot__sound-off{display:block;}",
      ".wz-ai-chatbot__tabs{display:none;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);background:var(--wz-panel);}",
      ".wz-ai-chatbot--page .wz-ai-chatbot__tabs{display:flex;}",
      ".wz-ai-chatbot__tab{flex:1;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:999px;padding:6px 10px;font-size:12px;cursor:pointer;}",
      ".wz-ai-chatbot__tab--active{background:var(--wz-primary);border-color:var(--wz-primary);color:#0b1220;font-weight:600;}",
      ".wz-ai-chatbot__messages{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}",
      ".wz-ai-chatbot__message{max-width:80%;padding:8px 10px;border-radius:12px;font-size:13px;line-height:1.4;}",
      ".wz-ai-chatbot__message-name{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#0b1220;background:rgba(34,197,94,0.85);border-radius:999px;padding:2px 8px;margin-bottom:6px;}",
      ".wz-ai-chatbot__message--visitor .wz-ai-chatbot__message-name{background:rgba(59,130,246,0.9);color:#0b1220;}",
      ".wz-ai-chatbot__message--visitor{align-self:flex-end;background:var(--wz-accent);color:#fff;}",
      ".wz-ai-chatbot__message--bot{align-self:flex-start;background:var(--wz-bot);color:#e2e8f0;}",
      ".wz-ai-chatbot__message-time{display:block;font-size:10px;color:rgba(226,232,240,0.6);margin-top:4px;}",
      ".wz-ai-chatbot__typing{font-style:italic;opacity:0.8;}",
      ".wz-ai-chatbot__input{display:flex;gap:8px;padding:12px;background:var(--wz-panel);border-top:1px solid rgba(255,255,255,0.08);position:sticky;bottom:0;z-index:2;}",
      ".wz-ai-chatbot__input input{flex:1;background:#0b1220;border:1px solid rgba(255,255,255,0.1);border-radius:999px;color:#e2e8f0;padding:8px 12px;font-size:13px;}",
      ".wz-ai-chatbot__input button{background:var(--wz-primary);border:none;border-radius:999px;color:#0b1220;padding:6px 14px;font-weight:600;cursor:pointer;}",
      ".wz-ai-chatbot__emoji{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:999px;padding:6px 10px;font-size:12px;}",
      ".wz-ai-chatbot__emoji-picker{position:absolute;right:16px;bottom:120px;background:#0b1220;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;box-shadow:0 10px 24px rgba(0,0,0,0.35);z-index:5;}",
      ".wz-ai-chatbot__emoji-picker button{background:transparent;border:none;color:#e2e8f0;font-size:16px;cursor:pointer;line-height:1;}",
      ".wz-ai-chatbot__footer{padding:8px 12px;background:var(--wz-panel);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;align-items:center;gap:8px;}",
      ".wz-ai-chatbot__brand{font-size:11px;margin-right:auto;}",
      ".wz-ai-chatbot__brand a{color:rgba(226,232,240,0.7);text-decoration:none;}",
      ".wz-ai-chatbot__brand a:hover{color:#e2e8f0;}",
      ".wz-ai-chatbot__callback{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;}",
      ".wz-ai-chatbot__enquiry{flex:1;padding:12px;display:flex;flex-direction:column;gap:8px;}",
      ".wz-ai-chatbot__enquiry-title{font-size:13px;font-weight:600;margin-bottom:4px;}",
      ".wz-ai-chatbot__enquiry-form{display:flex;flex-direction:column;gap:8px;}",
      ".wz-ai-chatbot__enquiry-form input,.wz-ai-chatbot__enquiry-form textarea{background:#0b1220;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e2e8f0;padding:6px 8px;font-size:12px;}",
      ".wz-ai-chatbot__enquiry-actions{display:flex;gap:8px;justify-content:flex-end;}",
      ".wz-ai-chatbot__enquiry-back{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;}",
      ".wz-ai-chatbot__enquiry-submit{background:#22c55e;border:none;border-radius:8px;color:#0b1220;padding:6px 10px;font-weight:600;font-size:12px;cursor:pointer;}",
      ".wz-ai-chatbot__enquiry-success{font-size:12px;color:#bbf7d0;}",
      ".wz-ai-chatbot__enquiry-error{font-size:12px;color:#fecaca;}",
      ".wz-ai-chatbot__prefill{padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--wz-panel);border-bottom:1px solid rgba(255,255,255,0.08);}",
      ".wz-ai-chatbot__prefill-title{font-size:13px;font-weight:600;}",
      ".wz-ai-chatbot__prefill-form{display:flex;flex-direction:column;gap:8px;}",
      ".wz-ai-chatbot__prefill-form input{background:#0b1220;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e2e8f0;padding:6px 8px;font-size:12px;}",
      ".wz-ai-chatbot__phone-row{display:flex;gap:8px;}",
      ".wz-ai-chatbot__phone-row input:first-child{width:90px;}",
      ".wz-ai-chatbot__prefill-submit{align-self:flex-end;background:var(--wz-primary);border:none;border-radius:8px;color:#0b1220;padding:6px 12px;font-weight:600;font-size:12px;cursor:pointer;}",
      ".wz-ai-chatbot__prefill-error{font-size:12px;color:#fecaca;}",
      "@media (max-width:520px){.wz-ai-chatbot{right:12px;left:12px;}.wz-ai-chatbot__panel{width:100%;}}",
      ".wz-ai-chatbot__hidden{display:none !important;}"
    ].join("");
    document.head.appendChild(style);
  }

  var script = getScriptElement();
  if (!script) {
    return;
  }
  var widgetKey = script.getAttribute("data-widget-key");
  if (!widgetKey) {
    return;
  }
  var apiBase = script.getAttribute("data-api-base") || "/api/ai-chatbot";
  var mode = script.getAttribute("data-mode") || (script.getAttribute("data-fullscreen") === "true" ? "page" : "widget");
  if (mode !== "page") {
    mode = "widget";
  }
  var source = mode === "page" ? "public_page" : "widget_embed";
  var visitorStorageKey = "wz_ai_chatbot_visitor_" + widgetKey;
  var profileStorageKey = "wz_ai_chatbot_profile_" + widgetKey;
  var soundStorageKey = "wz_ai_chatbot_sound_" + widgetKey;
  var soundEnabled = window.localStorage.getItem(soundStorageKey) !== "0";
  var visitorId = window.localStorage.getItem(visitorStorageKey);
  if (!visitorId) {
    visitorId = generateId();
    window.localStorage.setItem(visitorStorageKey, visitorId);
  }

  ensureStyles();
  var ui = buildUI(mode);
  var panel = ui.querySelector(".wz-ai-chatbot__panel");
  var toggle = ui.querySelector(".wz-ai-chatbot__toggle");
  var closeBtn = ui.querySelector(".wz-ai-chatbot__close");
  var soundBtn = ui.querySelector(".wz-ai-chatbot__sound");
  var titleEl = ui.querySelector(".wz-ai-chatbot__title");
  var statusEl = ui.querySelector(".wz-ai-chatbot__status");
  var statusTextEl = ui.querySelector(".wz-ai-chatbot__status-text");
  var tabs = ui.querySelectorAll(".wz-ai-chatbot__tab");
  var messagesEl = ui.querySelector(".wz-ai-chatbot__messages");
  var enquiryPanel = ui.querySelector(".wz-ai-chatbot__enquiry");
  var enquiryForm = ui.querySelector(".wz-ai-chatbot__enquiry-form");
  var enquirySuccess = ui.querySelector(".wz-ai-chatbot__enquiry-success");
  var enquiryError = ui.querySelector(".wz-ai-chatbot__enquiry-error");
  var enquiryBack = ui.querySelector(".wz-ai-chatbot__enquiry-back");
  var callbackBtn = ui.querySelector(".wz-ai-chatbot__callback");
  var prefillPanel = ui.querySelector(".wz-ai-chatbot__prefill");
  var prefillForm = ui.querySelector(".wz-ai-chatbot__prefill-form");
  var prefillError = ui.querySelector(".wz-ai-chatbot__prefill-error");
  var prefillNameInput = prefillForm ? prefillForm.querySelector("[name='visitor_name']") : null;
  var prefillEmailInput = prefillForm ? prefillForm.querySelector("[name='visitor_email']") : null;
  var prefillPhoneCodeInput = prefillForm ? prefillForm.querySelector("[name='visitor_phone_code']") : null;
  var prefillPhoneInput = prefillForm ? prefillForm.querySelector("[name='visitor_phone_number']") : null;
  var inputEl = ui.querySelector(".wz-ai-chatbot__input input");
  var sendBtn = ui.querySelector(".wz-ai-chatbot__input button:last-of-type");
  var emojiBtn = ui.querySelector(".wz-ai-chatbot__emoji");
  var emojiPicker = ui.querySelector(".wz-ai-chatbot__emoji-picker");

  var pollHandle = null;
  var conversationIds = { sales: null, support: null };
  var currentCategory = "sales";
  var typingEl = null;
  var emojiOpen = false;
  var lastMessageIdByCategory = { sales: null, support: null };
  var hasLoadedThreadByCategory = { sales: false, support: false };

  var emojis = ["😀","😅","😊","🙏","👍","🔥","🎉","❤️","😍","😎","😭","🤝","✅","⭐","📞","💬","🚀","🙌","🙂","👏"];

  function buildEmojiPicker() {
    if (!emojiPicker) {
      return;
    }
    emojiPicker.innerHTML = "";
    emojis.forEach(function (emoji) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = emoji;
      btn.addEventListener("click", function () {
        inputEl.value = (inputEl.value || "") + emoji;
        inputEl.focus();
        hideEmojiPicker();
      });
      emojiPicker.appendChild(btn);
    });
  }

  function showEmojiPicker() {
    if (!emojiPicker) {
      return;
    }
    emojiPicker.classList.remove("wz-ai-chatbot__hidden");
    emojiPicker.setAttribute("aria-hidden", "false");
    emojiOpen = true;
  }

  function hideEmojiPicker() {
    if (!emojiPicker) {
      return;
    }
    emojiPicker.classList.add("wz-ai-chatbot__hidden");
    emojiPicker.setAttribute("aria-hidden", "true");
    emojiOpen = false;
  }

  function updateSoundButton() {
    if (!soundBtn) {
      return;
    }
    if (soundEnabled) {
      soundBtn.classList.remove("wz-ai-chatbot__sound--off");
      soundBtn.setAttribute("title", "Sound on");
    } else {
      soundBtn.classList.add("wz-ai-chatbot__sound--off");
      soundBtn.setAttribute("title", "Sound off");
    }
  }

  function setSoundEnabled(next) {
    soundEnabled = next;
    try {
      window.localStorage.setItem(soundStorageKey, soundEnabled ? "1" : "0");
    } catch (error) {
      // Ignore storage errors.
    }
    updateSoundButton();
  }

  function playBeep() {
    if (!soundEnabled) {
      return;
    }
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    try {
      var ctx = new AudioContext();
      var gain = ctx.createGain();
      var osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 820;
      gain.gain.value = 0.22;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.4);
    } catch (error) {
      // Ignore audio errors.
    }
  }

  function startPolling() {
    if (pollHandle) {
      return;
    }
    fetchThread();
    pollHandle = window.setInterval(fetchThread, 5000);
  }

  buildEmojiPicker();
  updateSoundButton();

  function loadVisitorProfile() {
    try {
      var raw = window.localStorage.getItem(profileStorageKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function saveVisitorProfile(profile) {
    try {
      window.localStorage.setItem(profileStorageKey, JSON.stringify(profile));
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function showPrefill(show) {
    if (!prefillPanel || !inputEl) {
      return;
    }
    if (show) {
      prefillPanel.classList.remove("wz-ai-chatbot__hidden");
      if (enquiryPanel) {
        enquiryPanel.classList.add("wz-ai-chatbot__hidden");
      }
      messagesEl.classList.add("wz-ai-chatbot__hidden");
      inputEl.closest(".wz-ai-chatbot__input").classList.add("wz-ai-chatbot__hidden");
    } else {
      prefillPanel.classList.add("wz-ai-chatbot__hidden");
      messagesEl.classList.remove("wz-ai-chatbot__hidden");
      inputEl.closest(".wz-ai-chatbot__input").classList.remove("wz-ai-chatbot__hidden");
    }
  }

  function showPrefillError(message) {
    if (!prefillError) {
      return;
    }
    prefillError.textContent = message;
    prefillError.classList.remove("wz-ai-chatbot__hidden");
  }

  function hidePrefillError() {
    if (!prefillError) {
      return;
    }
    prefillError.classList.add("wz-ai-chatbot__hidden");
  }

  function populateCountryCodes() {
    if (!prefillPanel) {
      return;
    }
    var datalist = prefillPanel.querySelector("#wz-country-codes");
    if (!datalist) {
      return;
    }
    var codes = [
      { code: "+1", label: "United States" },
      { code: "+1", label: "Canada" },
      { code: "+44", label: "United Kingdom" },
      { code: "+91", label: "India" },
      { code: "+61", label: "Australia" },
      { code: "+65", label: "Singapore" },
      { code: "+971", label: "United Arab Emirates" },
      { code: "+966", label: "Saudi Arabia" },
      { code: "+49", label: "Germany" },
      { code: "+33", label: "France" },
      { code: "+39", label: "Italy" },
      { code: "+34", label: "Spain" },
      { code: "+31", label: "Netherlands" },
      { code: "+81", label: "Japan" },
      { code: "+82", label: "South Korea" },
      { code: "+86", label: "China" },
      { code: "+7", label: "Russia" },
      { code: "+55", label: "Brazil" },
      { code: "+52", label: "Mexico" },
      { code: "+27", label: "South Africa" }
    ];
    datalist.innerHTML = "";
    codes.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.code;
      option.label = item.label;
      datalist.appendChild(option);
    });
  }

  populateCountryCodes();

  function stopPolling() {
    if (pollHandle) {
      window.clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  function setOpen(isOpen) {
    if (mode === "page" && !isOpen) {
      return;
    }
    if (isOpen) {
      panel.classList.remove("wz-ai-chatbot__hidden");
      toggle.style.display = "none";
      startPolling();
    } else {
      panel.classList.add("wz-ai-chatbot__hidden");
      toggle.style.display = "inline-flex";
      stopPolling();
    }
  }

  function showEnquiryForm(show) {
    if (!enquiryPanel) {
      return;
    }
    if (show) {
      messagesEl.classList.add("wz-ai-chatbot__hidden");
      inputEl.closest(".wz-ai-chatbot__input").classList.add("wz-ai-chatbot__hidden");
      enquiryPanel.classList.remove("wz-ai-chatbot__hidden");
      if (enquirySuccess) {
        enquirySuccess.classList.add("wz-ai-chatbot__hidden");
      }
      if (enquiryError) {
        enquiryError.classList.add("wz-ai-chatbot__hidden");
      }
    } else {
      enquiryPanel.classList.add("wz-ai-chatbot__hidden");
      messagesEl.classList.remove("wz-ai-chatbot__hidden");
      inputEl.closest(".wz-ai-chatbot__input").classList.remove("wz-ai-chatbot__hidden");
    }
  }

  function renderMessages(messages) {
    messagesEl.innerHTML = "";
    messages.forEach(function (msg) {
      var bubble = document.createElement("div");
      bubble.className = "wz-ai-chatbot__message " +
        (msg.sender_type === "visitor" ? "wz-ai-chatbot__message--visitor" : "wz-ai-chatbot__message--bot");
      var timeValue = "";
      var senderName = "";
      if (msg.sender_name) {
        senderName = String(msg.sender_name || "").trim();
      } else if (msg.sender_type === "visitor") {
        senderName = "Visitor";
      } else if (msg.sender_type === "agent") {
        senderName = "Agent";
      } else if (msg.sender_type === "bot") {
        senderName = "Work Zilla";
      }
      if (msg.created_at) {
        try {
          var date = new Date(msg.created_at);
          timeValue = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch (error) {
          timeValue = "";
        }
      }
      bubble.innerHTML = escapeText(msg.text);
      if (senderName) {
        var nameEl = document.createElement("span");
        nameEl.className = "wz-ai-chatbot__message-name";
        nameEl.textContent = senderName;
        bubble.insertBefore(nameEl, bubble.firstChild);
      }
      if (timeValue) {
        var timeEl = document.createElement("span");
        timeEl.className = "wz-ai-chatbot__message-time";
        timeEl.textContent = timeValue;
        bubble.appendChild(timeEl);
      }
      messagesEl.appendChild(bubble);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    if (typingEl) {
      return;
    }
    typingEl = document.createElement("div");
    typingEl.className = "wz-ai-chatbot__message wz-ai-chatbot__message--bot wz-ai-chatbot__typing";
    typingEl.textContent = "Typing...";
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
    typingEl = null;
  }

  function appendLocalBotMessage(text) {
    if (!text) {
      return;
    }
    var bubble = document.createElement("div");
    bubble.className = "wz-ai-chatbot__message wz-ai-chatbot__message--bot";
    bubble.innerHTML = escapeText(text);
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function fetchConfig() {
    return fetch(apiBase + "/widget/config?key=" + encodeURIComponent(widgetKey))
      .then(function (response) {
        if (!response.ok) {
          throw new Error("config_failed");
        }
        return response.json();
      })
      .then(function (data) {
        if (data && data.name) {
          titleEl.textContent = data.name;
        }
        if (statusTextEl) {
          statusTextEl.textContent = "Online · Typically replies in a few minutes";
        }
        if (statusEl) {
          statusEl.classList.remove("wz-ai-chatbot__status--online", "wz-ai-chatbot__status--away", "wz-ai-chatbot__status--offline");
          statusEl.classList.add("wz-ai-chatbot__status--online");
        }
        if (data && data.theme) {
          applyTheme(data.theme);
        }
        return data;
      });
  }

  function fetchThread() {
    var url = apiBase + "/widget/thread?key=" + encodeURIComponent(widgetKey) +
      "&visitor_id=" + encodeURIComponent(visitorId) +
      "&category=" + encodeURIComponent(currentCategory);
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("thread_failed");
        }
        return response.json();
      })
      .then(function (data) {
        if (data.conversation_id) {
          conversationIds[currentCategory] = data.conversation_id;
        }
        var messages = data.messages || [];
        var lastMsg = messages.length ? messages[messages.length - 1] : null;
        var lastId = lastMsg ? lastMsg.id : null;
        if (hasLoadedThreadByCategory[currentCategory] && lastId && lastId !== lastMessageIdByCategory[currentCategory]) {
          if (lastMsg.sender_type && lastMsg.sender_type !== "visitor") {
            playBeep();
          }
        }
        lastMessageIdByCategory[currentCategory] = lastId;
        hasLoadedThreadByCategory[currentCategory] = true;
        renderMessages(messages);
        return data;
      });
  }

  function sendMessage() {
    var text = String(inputEl.value || "").trim();
    if (!text) {
      return;
    }
    if (!visitorProfile) {
      showPrefill(true);
      return;
    }
    showTyping();
    inputEl.value = "";
    return fetch(apiBase + "/widget/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: widgetKey,
        visitor_id: visitorId,
        text: text,
        name: visitorProfile.name,
        email: visitorProfile.email,
        phone: visitorProfile.phone,
        category: currentCategory,
      source: source
    })
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json()
            .then(function (data) {
              hideTyping();
              appendLocalBotMessage(data && data.message ? data.message : "Unable to send message right now.");
              return null;
            })
            .catch(function () {
              hideTyping();
              appendLocalBotMessage("Unable to send message right now.");
              return null;
            });
        }
        return response.json();
      })
      .then(function (data) {
        if (!data) {
          hideTyping();
          return null;
        }
        if (data.conversation_id) {
          conversationIds[currentCategory] = data.conversation_id;
        }
        hideTyping();
        renderMessages(data.messages || []);
        return data;
      });
  }

  function applyTheme(theme) {
    var preset = String(theme.preset || "emerald");
    var presets = {
      emerald: { primary: "#22c55e", accent: "#2563eb", background: "#0f172a", panel: "#111827" },
      ocean: { primary: "#38bdf8", accent: "#0ea5e9", background: "#0b1220", panel: "#0f172a" },
      violet: { primary: "#8b5cf6", accent: "#ec4899", background: "#120c1f", panel: "#1f1233" },
      amber: { primary: "#f59e0b", accent: "#ef4444", background: "#1a1208", panel: "#24160b" },
      graphite: { primary: "#94a3b8", accent: "#64748b", background: "#0b1220", panel: "#111827" },
      custom: { primary: theme.primary, accent: theme.accent, background: theme.background, panel: "#111827" }
    };
    var selected = presets[preset] || presets.emerald;
    ui.style.setProperty("--wz-primary", selected.primary || "#22c55e");
    ui.style.setProperty("--wz-accent", selected.accent || "#2563eb");
    ui.style.setProperty("--wz-bg", selected.background || "#0f172a");
    ui.style.setProperty("--wz-panel", selected.panel || "#111827");
    ui.style.setProperty("--wz-bot", "#1f2937");
  }

  toggle.addEventListener("click", function () {
    setOpen(true);
  });
  closeBtn.addEventListener("click", function () {
    setOpen(false);
  });
  if (soundBtn) {
    soundBtn.addEventListener("click", function () {
      setSoundEnabled(!soundEnabled);
    });
  }
  sendBtn.addEventListener("click", function () {
    sendMessage();
  });
  inputEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
  if (callbackBtn) {
    callbackBtn.addEventListener("click", function () {
      showEnquiryForm(true);
    });
  }

  if (prefillForm) {
    prefillForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var nameValue = String(prefillNameInput ? prefillNameInput.value : "").trim();
      var emailValue = String(prefillEmailInput ? prefillEmailInput.value : "").trim();
      var phoneCodeValue = String(prefillPhoneCodeInput ? prefillPhoneCodeInput.value : "").trim();
      var phoneValue = String(prefillPhoneInput ? prefillPhoneInput.value : "").trim();
      if (!nameValue || !emailValue || emailValue.indexOf("@") === -1 || !phoneCodeValue || !phoneValue) {
        showPrefillError("Please enter your name, email, and mobile number.");
        return;
      }
      hidePrefillError();
      visitorProfile = {
        name: nameValue,
        email: emailValue,
        phone_code: phoneCodeValue,
        phone_number: phoneValue,
        phone: (phoneCodeValue + " " + phoneValue).trim()
      };
      saveVisitorProfile(visitorProfile);
      showPrefill(false);
    });
  }

  if (emojiBtn) {
    emojiBtn.addEventListener("click", function () {
      if (emojiOpen) {
        hideEmojiPicker();
      } else {
        showEmojiPicker();
      }
    });
  }
  document.addEventListener("click", function (event) {
    if (!emojiOpen || !emojiPicker) {
      return;
    }
    var target = event.target;
    if (target === emojiBtn || emojiPicker.contains(target)) {
      return;
    }
    hideEmojiPicker();
  });
  if (tabs && tabs.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var nextCategory = tab.getAttribute("data-tab") || "sales";
        if (nextCategory === currentCategory) {
          return;
        }
        currentCategory = nextCategory;
        tabs.forEach(function (btn) {
          btn.classList.remove("wz-ai-chatbot__tab--active");
        });
        tab.classList.add("wz-ai-chatbot__tab--active");
        renderMessages([]);
        fetchThread();
      });
    });
  }
  if (enquiryBack) {
    enquiryBack.addEventListener("click", function () {
      showEnquiryForm(false);
    });
  }
  if (enquiryForm) {
    enquiryForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var payload = {
        widget_key: widgetKey,
        visitor_id: visitorId,
        conversation_id: conversationId,
        name: enquiryForm.elements.name.value,
        phone: enquiryForm.elements.phone.value,
        email: enquiryForm.elements.email.value,
        message: enquiryForm.elements.message.value,
        page_url: window.location.href
      };
      if (enquirySuccess) {
        enquirySuccess.classList.add("wz-ai-chatbot__hidden");
      }
      if (enquiryError) {
        enquiryError.classList.add("wz-ai-chatbot__hidden");
      }
      fetch(apiBase + "/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json()
              .then(function (data) {
                if (enquiryError) {
                  enquiryError.textContent = (data && data.message) ? data.message : "Unable to submit enquiry.";
                }
                throw new Error("lead_failed");
              })
              .catch(function () {
                if (enquiryError) {
                  enquiryError.textContent = "Unable to submit enquiry.";
                }
                throw new Error("lead_failed");
              });
          }
          return response.json();
        })
        .then(function () {
          enquiryForm.reset();
          if (enquirySuccess) {
            enquirySuccess.classList.remove("wz-ai-chatbot__hidden");
          }
        })
        .catch(function () {
          if (enquiryError) {
            enquiryError.classList.remove("wz-ai-chatbot__hidden");
          }
        });
    });
  }

  var visitorProfile = loadVisitorProfile();
  if (prefillPhoneCodeInput && !prefillPhoneCodeInput.value) {
    prefillPhoneCodeInput.value = "+91";
  }
  if (visitorProfile && prefillNameInput && prefillEmailInput && prefillPhoneInput) {
    prefillNameInput.value = visitorProfile.name || "";
    prefillEmailInput.value = visitorProfile.email || "";
    if (prefillPhoneCodeInput) {
      prefillPhoneCodeInput.value = visitorProfile.phone_code || prefillPhoneCodeInput.value;
    }
    prefillPhoneInput.value = visitorProfile.phone_number || "";
  }
  showPrefill(!visitorProfile);

  setOpen(mode === "page");
  fetchConfig()
    .then(fetchThread)
    .catch(function () {
      titleEl.textContent = "Chat";
    });
})();
