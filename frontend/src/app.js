// Anime Learning Companion - Full Featured Version
// Continuous conversation + Practice mode with corrections

import { startListening, stopListening } from "./speech.js";
import { avatarStartTalking, avatarStopTalking } from "./threejs-avatar.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// DEVICE DETECTION
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const IS_MOBILE = isMobileDevice();
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

console.log(`📱 Device: ${IS_MOBILE ? 'Mobile' : 'Desktop'}`, {
  iOS: IS_IOS,
  Android: IS_ANDROID,
  userAgent: navigator.userAgent
});

/* -------------------------
   UI ELEMENTS
   ------------------------- */
const micBtn = document.getElementById("micBtn");
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const menuOverlay = document.getElementById("menuOverlay");
const menuClose = document.getElementById("menuClose");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");
const modeToggle = document.getElementById("modeToggle");

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const chatCaption = document.getElementById("chatCaption");
const correctionDisplay = document.getElementById("correctionDisplay");
const correctionContent = document.getElementById("correctionContent");

/* ============================
   STATE
   ============================ */
let isListening = false;
let isSpeaking = false;
let isContinuousMode = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;
let recognitionTimeout = null;
let speechBuffer = "";

/* ============================
   STORAGE
   ============================ */
const STORAGE_KEY = "anime_companion_history";
const MAX_HISTORY_ITEMS = 200;

/* ============================
   LOGGING
   ============================ */
function log(msg) {
  if (logEl) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.innerHTML += '<span style="color:#999">[' + timestamp + ']</span> ' + msg + "<br>";
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log("[Companion]", msg);
}

/* ============================
   LOCAL STORAGE
   ============================ */
function saveConversationHistory() {
  try {
    const historyToSave = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyToSave));
    log("💾 Saved (" + historyToSave.length + " messages)");
  } catch (err) {
    console.error("Failed to save conversation:", err);
  }
}

function loadConversationHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      log("📂 Loaded " + conversationHistory.length + " messages");
      return true;
    }
  } catch (err) {
    console.error("Failed to load conversation:", err);
  }
  return false;
}

function clearConversationStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    conversationHistory = [];
    log("🗑️ Storage cleared");
  } catch (err) {
    console.error("Failed to clear storage:", err);
  }
}

/* ============================
   Caption Functions
   ============================ */
export function showCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
  clearTimeout(window.__captionHideTimer);
}

function hideCaptionText() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
  clearTimeout(window.__captionHideTimer);
}

/* ============================
   PRACTICE MODE - CORRECTION IN MENU
   ============================ */
function showCorrection(userText, correctedText, explanation, correctness) {
  if (!correctionContent || !correctionDisplay) return;

  let statusClass = "";
  let statusIcon = "";
  let statusText = "";
  
  if (correctness === "correct") {
    statusClass = "correction-correct";
    statusIcon = "✔️";
    statusText = "Perfect!";
  } else if (correctness === "almost") {
    statusClass = "correction-almost";
    statusIcon = "⚠️";
    statusText = "Almost!";
  } else {
    statusClass = "correction-wrong";
    statusIcon = "❌";
    statusText = "Let's fix";
  }

  const html = `
    <div class="${statusClass}">
      <div class="correction-display-header">
        <span>${statusIcon}</span>
        <span>${statusText}</span>
      </div>
      
      <div class="correction-display-content">
        <div class="correction-display-section">
          <div class="correction-display-label">You said:</div>
          <div class="correction-display-text">"${escapeHtml(userText)}"</div>
        </div>
        
        ${correctness !== "correct" ? `
          <div class="correction-display-section">
            <div class="correction-display-label">Corrected:</div>
            <div class="correction-display-text correction-green">"${escapeHtml(correctedText)}"</div>
          </div>
          
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            ${escapeHtml(explanation)}
          </div>
        ` : `
          <div style="text-align: center; color: #4caf50; font-weight: 600; margin-top: 8px;">
            Perfect! 🎉
          </div>
        `}
      </div>
    </div>
  `;

  correctionContent.innerHTML = html;
  correctionDisplay.style.display = "block";

  if (menuPanel && menuPanel.classList.contains("active")) {
    setTimeout(() => {
      correctionDisplay.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }
}

function hideCorrection() {
  if (!correctionDisplay) return;
  correctionDisplay.style.display = "none";
}

/* ============================
   STATUS
   ============================ */
function setStatus(message, type) {
  if (!statusEl) return;

  const friendlyMessages = {
    ready: "Ready to chat! 💭",
    listening: "Listening... 👂",
    thinking: "Thinking... 💭",
    speaking: "💬",
    error: "Oops! 😅",
  };

  statusEl.textContent = friendlyMessages[type] || message;
}

/* ============================
   UTILITIES
   ============================ */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderReplyMarkdown(md) {
  const html = marked && marked.parse ? marked.parse(md) : md;
  const safe = DOMPurify && DOMPurify.sanitize ? DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }) : html;

  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

/* ============================
   PROMPT BUILDER
   ============================ */
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English learning companion (age 16-17, warm and supportive).

TASK: Analyze this sentence for grammar/spelling errors and provide a structured response.

Student said: "${userText}"

Respond in this EXACT JSON format ( no code fences ):
{
  "correctness": "correct" OR "almost" OR "wrong",
  "corrected": "the corrected sentence here",
  "explanation": "1-2 sentence explanation of what was fixed",
  "reply": "encouraging 1-2 sentence response"
}`;
  } else {
    const characterProfile = `You're a warm, supportive, anime-style 16-17 year old English companion.

- Cheerful but not childish  
- Not repetitive  
- No catchphrases  
- Engaging and friendly  
- Replies must be 1–3 sentences`;

    const history = conversationHistory.slice(-15)
      .map(m => (m.role === "user" ? "Student: " : "You: ") + m.content)
      .join("\n");

    return `${characterProfile}

${history}

Student: "${userText}"

Respond in 1–3 sentences.`;
  }
}

/* ============================
   CONSISTENT VOICE SELECTION
   ============================ */
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const premiumVoices = [
    "Google US English Female",
    "Microsoft Zira",
    "Samantha",
    "Karen"
  ];

  for (const voiceName of premiumVoices) {
    const found = voices.find(v => v.name.includes(voiceName));
    if (found) return found;
  }

  const femaleEnglish = voices.filter(v =>
    v.lang.startsWith("en") && /female|woman|girl/i.test(v.name)
  );

  return femaleEnglish[0] || voices[0];
}

/* ============================
   SPEAK (TTS)
   ============================ */
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();

  const cleanedText = text.replace(/[*_~`#\[\]]/g, "").trim();
  lastSpokenText = cleanedText;

  const utter = new SpeechSynthesisUtterance(cleanedText);

  utter.lang = "en-US";
  utter.volume = 1.0;

  if (IS_MOBILE) {
    utter.rate = 0.88;
    utter.pitch = 1.15;
  } else {
    utter.rate = 0.95;
    utter.pitch = 1.22;
  }

  const bestVoice = selectBestVoice();
  if (bestVoice) utter.voice = bestVoice;

  utter.onstart = () => {
    isSpeaking = true;
    avatarStartTalking?.();
    showCaptionText(cleanedText);
    setStatus("💬", "speaking");
  };

  utter.onend = () => {
    isSpeaking = false;
    avatarStopTalking?.();
    hideCaptionText();

    if (isContinuousMode) {
      const delay = IS_MOBILE ? 1200 : 800;
      setTimeout(startNextListeningCycle, delay);
    } else {
      setStatus("Your turn! 💭", "ready");
    }
  };

  window.speechSynthesis.cancel();
  if (IS_MOBILE) {
    setTimeout(() => window.speechSynthesis.speak(utter), 150);
  } else {
    window.speechSynthesis.speak(utter);
  }
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  avatarStopTalking?.();
  hideCaptionText();
}

/* ============================
   FIXED: START LISTENING CYCLE
   ============================ */
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;

  setStatus("Listening... 👂", "listening");
  isListening = true;
  speechBuffer = "";

  log("🎤 Starting listening cycle...");

  // FIXED — Removed interimResults:true (breaks mobile)
  const options = {
    continuous: false,
    lang: "en-IN"
  };

  startListening(handleUserSpeech, options);
}

function handleUserSpeech(text, isFinal = true) {
  log(`🎤 handleUserSpeech: "${text}", final=${isFinal}`);

  if (!text || !text.trim()) {
    if (isContinuousMode && isFinal) {
      setTimeout(startNextListeningCycle, 500);
    }
    return;
  }

  if (!isFinal) {
    speechBuffer = text;
    return;
  }

  const finalText = speechBuffer || text;
  speechBuffer = "";

  sendToBackend(finalText);
}

/* ============================
   BACKEND COMMUNICATION
   ============================ */
async function sendToBackend(text) {
  if (!text.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();

  setStatus("Thinking... 💭", "thinking");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: isPracticeMode ? 0.3 : 0.5,
        max_tokens: isPracticeMode ? 200 : 120
      })
    });

    const data = await res.json();
    const reply = data.reply || "I'm here for you!";

    if (isPracticeMode) handlePracticeMode(text, reply);
    else handleCasualMode(reply);
  } catch (err) {
    speak("Sorry, I lost connection. Try again?");
  }
}

function handlePracticeMode(userText, reply) {
  try {
    const cleaned = reply.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    conversationHistory.push({ role: "assistant", content: parsed.reply });
    saveConversationHistory();

    showCorrection(
      userText,
      parsed.corrected,
      parsed.explanation,
      parsed.correctness
    );

    speak(parsed.reply);
  } catch {
    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();
    speak(reply);
  }
}

function handleCasualMode(reply) {
  conversationHistory.push({ role: "assistant", content: reply });
  saveConversationHistory();
  speak(reply);
}

/* ============================
   EVENT LISTENERS
   ============================ */

micBtn?.addEventListener("click", () => {
  if (isContinuousMode) {
    isContinuousMode = false;
    stopListening();
    stopSpeech();
    isListening = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Paused 💭", "ready");
  } else {
    isContinuousMode = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    setStatus("Listening... 👂", "listening");
    startNextListeningCycle();
  }
});

/* ============================
   INITIALIZATION
   ============================ */

function initialize() {
  loadConversationHistory();
  setStatus("Ready to chat! 💭", "ready");

  if (IS_MOBILE && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else initialize();

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) stopSpeech();
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (isListening) stopListening();
});
