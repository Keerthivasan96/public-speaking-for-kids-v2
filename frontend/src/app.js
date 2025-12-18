// ============================================
// app.js - 3D MODE VERSION
// LOCATION: frontend/src/app.js
// ACTION: REPLACE YOUR EXISTING app.js
// ============================================

import { startListening, stopListening } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking 
} from "./threejs-avatar-3d.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// ============================================
// DEVICE DETECTION
// ============================================
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

console.log(`📱 Device: ${IS_MOBILE ? 'Mobile' : 'Desktop'}`, { iOS: IS_IOS, Android: IS_ANDROID });

// ============================================
// UI ELEMENTS
// ============================================
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

// Avatar selection
const avatarOptions = document.querySelectorAll(".avatar-option");

// ============================================
// STATE
// ============================================
let isListening = false;
let isSpeaking = false;
let isContinuousMode = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;
let speechBuffer = "";

// Current avatar path
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// ============================================
// STORAGE
// ============================================
const STORAGE_KEY = "anime_companion_history";
const AVATAR_KEY = "anime_companion_avatar";
const MAX_HISTORY_ITEMS = 200;

// ============================================
// LOGGING
// ============================================
function log(msg) {
  if (logEl) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.innerHTML += '<span style="color:#999">[' + timestamp + ']</span> ' + msg + "<br>";
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log("[App]", msg);
}

// ============================================
// LOCAL STORAGE
// ============================================
function saveConversationHistory() {
  try {
    const historyToSave = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyToSave));
  } catch (err) {
    console.error("Failed to save:", err);
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
    console.error("Failed to load:", err);
  }
  return false;
}

function clearConversationStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    conversationHistory = [];
    log("🗑️ Cleared");
  } catch (err) {
    console.error("Failed to clear:", err);
  }
}

function saveAvatarChoice(path) {
  localStorage.setItem(AVATAR_KEY, path);
}

function loadAvatarChoice() {
  return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm";
}

// ============================================
// CAPTION
// ============================================
function showCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
}

function hideCaptionText() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
}

// ============================================
// PRACTICE MODE CORRECTION
// ============================================
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
}

function hideCorrection() {
  if (correctionDisplay) {
    correctionDisplay.style.display = "none";
  }
}

// ============================================
// STATUS
// ============================================
function setStatus(message, type) {
  if (!statusEl) return;

  const messages = {
    ready: "Ready to chat! 💭",
    listening: "Listening... 👂",
    thinking: "Thinking... 💭",
    speaking: "💬",
    error: "Oops! 😅",
  };

  statusEl.textContent = messages[type] || message;
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderReplyMarkdown(md) {
  const html = marked && marked.parse ? marked.parse(md) : md;
  const safe = DOMPurify && DOMPurify.sanitize ? DOMPurify.sanitize(html) : html;
  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

// ============================================
// PROMPT BUILDER
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English learning companion (age 16-17, warm and supportive).

TASK: Analyze this sentence for grammar/spelling errors.

Student said: "${userText}"

Respond in this EXACT JSON format (no markdown):
{
  "correctness": "correct" OR "almost" OR "wrong",
  "corrected": "the corrected sentence",
  "explanation": "brief explanation",
  "reply": "encouraging response"
}

Rules:
- If perfect: correctness="correct"
- If minor errors: correctness="almost"
- If major errors: correctness="wrong"
- Always be encouraging
- Keep explanation under 20 words`;
  } else {
    const profile = `You're a friendly 16-17 year old anime-style English companion. Warm, supportive, genuinely interested.

Personality:
- Cheerful and encouraging
- Natural and conversational
- Show genuine interest with follow-up questions
- Age-appropriate for 13-15 year olds
- No catchphrases or repetitive patterns`;

    const history = conversationHistory.slice(-15).map(m => 
      (m.role === "user" ? "Student" : "You") + ": " + m.content
    ).join("\n");

    return `${profile}

Recent conversation:
${history || "(First message)"}

Student: "${userText}"

Respond in 1-3 sentences (30-50 words). Be warm, natural, engaging!`;
  }
}

// ============================================
// VOICE SELECTION
// ============================================
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const premium = [
    "Google US English Female",
    "Google UK English Female", 
    "Microsoft Zira",
    "Samantha",
    "Karen",
    "Victoria"
  ];

  for (const name of premium) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }

  const female = voices.filter(v => 
    (v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) &&
    /female|woman|girl/i.test(v.name)
  );
  if (female.length > 0) return female[0];

  const english = voices.find(v => v.lang.startsWith("en"));
  return english || voices[0];
}

// ============================================
// TTS (Text to Speech)
// ============================================
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();

  const cleanText = text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
  lastSpokenText = cleanText;

  const utter = new SpeechSynthesisUtterance(cleanText);
  utter.lang = "en-US";
  utter.volume = 1.0;
  
  if (IS_MOBILE) {
    utter.rate = IS_ANDROID ? 0.85 : 0.88;
    utter.pitch = IS_ANDROID ? 1.12 : 1.15;
  } else {
    utter.rate = 0.95;
    utter.pitch = 1.22;
  }

  const voice = selectBestVoice();
  if (voice) utter.voice = voice;

  utter.onstart = () => {
    isSpeaking = true;
    avatarStartTalking();
    showCaptionText(cleanText);
    setStatus("💬", "speaking");
    log("🔊 Speaking...");
  };

  utter.onend = () => {
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    log("🔇 Done");

    if (isContinuousMode) {
      const delay = IS_MOBILE ? 1200 : 800;
      setTimeout(startNextListeningCycle, delay);
    } else {
      setStatus("Your turn! 💭", "ready");
    }
  };

  utter.onerror = (e) => {
    console.error("TTS error:", e);
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    
    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, 1500);
    }
  };

  try {
    window.speechSynthesis.cancel();
  } catch (e) {}

  if (IS_MOBILE) {
    setTimeout(() => window.speechSynthesis.speak(utter), 150);
  } else {
    window.speechSynthesis.speak(utter);
  }
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  avatarStopTalking();
  hideCaptionText();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;

  setStatus("Listening... 👂", "listening");
  isListening = true;
  speechBuffer = "";
  
  log("🎤 Listening...");
  
  startListening(handleUserSpeech, {
    continuous: false,
    lang: "en-IN",
    interimResults: true
  });
}

function handleUserSpeech(text, isFinal = true) {
  log(`🎤 "${text}" (final=${isFinal})`);
  
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
  
  log("✅ " + finalText);
  sendToBackend(finalText);
}

// ============================================
// BACKEND COMMUNICATION
// ============================================
async function sendToBackend(text) {
  if (!text || !text.trim()) return;

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
        max_tokens: isPracticeMode ? 200 : 100,
      }),
    });

    if (!res.ok) throw new Error("Backend error: " + res.status);

    const data = await res.json();
    const reply = data.reply || "I'm here for you!";

    if (isPracticeMode) {
      handlePracticeMode(text, reply);
    } else {
      handleCasualMode(reply);
    }
  } catch (err) {
    console.error("Backend error:", err);
    setStatus("Oops! 😅", "error");
    speak("Sorry, I lost connection. Can you try again?");
  }
}

function handlePracticeMode(userText, reply) {
  try {
    const cleaned = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    conversationHistory.push({ role: "assistant", content: parsed.reply });
    saveConversationHistory();

    if (parsed.correctness !== "correct") {
      showCorrection(userText, parsed.corrected, parsed.explanation, parsed.correctness);
    } else {
      showCorrection(userText, userText, "", "correct");
    }

    speak(parsed.reply);
  } catch (e) {
    console.error("Parse error:", e);
    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();
    speak(renderReplyMarkdown(reply));
  }
}

function handleCasualMode(reply) {
  conversationHistory.push({ role: "assistant", content: reply });
  saveConversationHistory();
  speak(renderReplyMarkdown(reply));
}

// ============================================
// AVATAR SWITCHING
// ============================================
async function switchAvatar(avatarPath) {
  log("🔄 Switching avatar: " + avatarPath);
  currentAvatarPath = avatarPath;
  saveAvatarChoice(avatarPath);
  
  try {
    await loadVRMAvatar(avatarPath);
    log("✅ Avatar loaded!");
  } catch (err) {
    console.error("Avatar load failed:", err);
    log("❌ Avatar failed: " + err.message);
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Menu toggle
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    menuPanel.classList.add("active");
    menuOverlay.classList.add("active");
  });
}

if (menuClose) {
  menuClose.addEventListener("click", () => {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener("click", () => {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Practice mode toggle
if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    isPracticeMode = !isPracticeMode;
    modeToggle.classList.toggle("active", isPracticeMode);

    const label = modeToggle.querySelector(".mode-label");
    if (label) {
      label.textContent = isPracticeMode ? "Practice Mode" : "Casual Chat";
    }

    hideCorrection();
    log(isPracticeMode ? "📝 Practice Mode" : "💬 Casual Chat");
    setStatus(isPracticeMode ? "Practice Mode! 📝" : "Casual Chat! 💭", "ready");
  });
}

// Mic button
if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (isContinuousMode) {
      // STOP
      isContinuousMode = false;
      stopListening();
      stopSpeech();
      isListening = false;

      micBtn.classList.remove("active");
      micBtn.textContent = "🎤";
      micBtn.title = "Start conversation";

      setStatus("Paused 💭", "ready");
      log("⏸️ Paused");
    } else {
      // START
      isContinuousMode = true;
      micBtn.classList.add("active");
      micBtn.textContent = "⏸️";
      micBtn.title = "Pause conversation";

      setStatus("Listening... 👂", "listening");
      log("▶️ Started");
      
      startNextListeningCycle();
    }
  });
}

// Clear button
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (!confirm("Start fresh? This will clear chat history.")) return;

    clearConversationStorage();
    stopSpeech();
    hideCaptionText();
    hideCorrection();

    setStatus("Fresh start! 🌟", "ready");
    log("🗑️ Cleared");

    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Demo lesson button
if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", () => {
    const challenges = [
      "Tell me about something that made you smile today!",
      "What's your favorite hobby or thing to do?",
      "If you could learn any new skill, what would it be?",
      "Tell me about a friend who's important to you.",
      "What's your favorite anime or show right now?",
      "Describe your perfect weekend!",
    ];

    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    speak(challenge);

    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Avatar selection
avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    // Remove active from all
    avatarOptions.forEach(b => b.classList.remove("active"));
    // Add active to clicked
    btn.classList.add("active");
    
    const avatarPath = btn.dataset.avatar;
    if (avatarPath) {
      switchAvatar(avatarPath);
    }
  });
});

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  log("🚀 Starting 3D Companion...");

  // Load saved avatar choice
  currentAvatarPath = loadAvatarChoice();
  log("📁 Avatar: " + currentAvatarPath);

  // Initialize 3D scene
  const sceneReady = init3DScene("canvas-container");
  if (!sceneReady) {
    log("❌ 3D scene failed!");
    return;
  }

  // Load VRM avatar
  try {
    await loadVRMAvatar(currentAvatarPath);
    log("✅ Avatar loaded!");
  } catch (err) {
    console.error("Avatar error:", err);
    log("⚠️ Avatar failed, trying fallback...");
    
    // Try fallback avatar
    try {
      await loadVRMAvatar("/assets/vrmavatar1.vrm");
      log("✅ Fallback avatar loaded");
    } catch (err2) {
      log("❌ All avatars failed: " + err2.message);
    }
  }

  // Mark active avatar in UI
  avatarOptions.forEach(btn => {
    if (btn.dataset.avatar === currentAvatarPath) {
      btn.classList.add("active");
    }
  });

  // Load conversation history
  const hasHistory = loadConversationHistory();
  if (hasHistory) {
    setStatus("Welcome back! 😊", "ready");
  } else {
    setStatus("Ready to chat! 💭", "ready");
  }

  // Load voices
  if (window.speechSynthesis) {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      log("🔊 " + voices.length + " voices");
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Request mic permission on mobile
  if (IS_MOBILE && navigator.mediaDevices?.getUserMedia) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      log("✅ Mic allowed");
    } catch (err) {
      console.error("Mic denied:", err);
      alert("Please allow microphone access.");
    }
  }
  
  log("✅ Ready!");
}

// Start app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Cleanup on page hide/close
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) stopSpeech();
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (isListening) stopListening();
});