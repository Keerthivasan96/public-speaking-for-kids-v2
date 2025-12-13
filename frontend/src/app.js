// Anime Learning Companion - Full Featured Version
// Continuous conversation + Practice mode with corrections

import { startListening, stopListening } from "./speech.js";
import { avatarStartTalking, avatarStopTalking } from "./threejs-avatar.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// DEVICE DETECTION
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

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

  // Scroll menu to show correction
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
   IMPROVED PROMPT BUILDER
   ============================ */
function buildPrompt(userText) {
  if (isPracticeMode) {
    // PRACTICE MODE: Request structured correction
    return `You are a friendly English learning companion (age 16-17, warm and supportive).

TASK: Analyze this sentence for grammar/spelling errors and provide a structured response.

Student said: "${userText}"

Respond in this EXACT JSON format (no markdown, no code blocks):
{
  "correctness": "correct" OR "almost" OR "wrong",
  "corrected": "the corrected sentence here",
  "explanation": "1-2 sentence explanation of what was fixed",
  "reply": "encouraging 1-2 sentence response to the student"
}

Rules:
- If sentence is perfect: correctness="correct", corrected=original, explanation="", reply=praise
- If minor errors: correctness="almost", fix them, explain briefly
- If major errors: correctness="wrong", fix them, explain kindly
- Always be encouraging and supportive
- Keep explanation under 20 words
- Reply should be warm and friendly (13-15 year old appropriate)`;
  } else {
    // CASUAL MODE: Natural conversation
    const characterProfile = `You're a friendly 16-17 year old anime-style English companion. You're warm, supportive, and genuinely interested in conversations.

Your personality:
- Cheerful and encouraging (like a supportive friend)
- Natural and conversational (not formal or teacherly)
- Expressive but not overdone
- Show genuine interest with follow-up questions
- Age-appropriate for 13-15 year olds
- No catchphrases or repetitive patterns`;

    const history = conversationHistory.slice(-15).map(function (m) {
      return (m.role === "user" ? "Student" : "You") + ": " + m.content;
    }).join("\n");

    return `${characterProfile}

Recent conversation:
${history || "(First message)"}

Student: "${userText}"

Respond in 1-3 sentences (30-50 words). Be warm, natural, and engaging. Show interest!`;
  }
}

/* ============================
   CONSISTENT VOICE SELECTION
   ============================ */
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // PRIORITY SYSTEM for consistent voice across devices
  
  // 1. Look for specific high-quality female voices
  const premiumVoices = [
    "Google US English Female",
    "Google UK English Female", 
    "Microsoft Zira",
    "Samantha",
    "Karen",
    "Victoria",
    "Fiona",
    "Google हिन्दी Female" // Hindi but works for English
  ];

  for (const voiceName of premiumVoices) {
    const found = voices.find(v => v.name.includes(voiceName));
    if (found) {
      log("✓ Using premium voice: " + found.name);
      return found;
    }
  }

  // 2. Female Indian English
  const femaleIndian = voices.filter(v => 
    v.lang.startsWith("en-IN") && /female|woman/i.test(v.name)
  );
  if (femaleIndian.length > 0) {
    log("✓ Using voice: " + femaleIndian[0].name);
    return femaleIndian[0];
  }

  // 3. Any Indian English
  const indianVoices = voices.filter(v => v.lang.startsWith("en-IN"));
  if (indianVoices.length > 0) {
    log("✓ Using voice: " + indianVoices[0].name);
    return indianVoices[0];
  }

  // 4. Female English (US/GB)
  const femaleEnglish = voices.filter(v => 
    (v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) &&
    /female|woman|girl/i.test(v.name)
  );
  if (femaleEnglish.length > 0) {
    log("✓ Using voice: " + femaleEnglish[0].name);
    return femaleEnglish[0];
  }

  // 5. Any English female voice
  const anyFemale = voices.find(v => 
    v.lang.startsWith("en") && /female|woman/i.test(v.name)
  );
  if (anyFemale) {
    log("✓ Using voice: " + anyFemale.name);
    return anyFemale;
  }

  // 6. Fallback to first English voice
  const anyEnglish = voices.find(v => v.lang.startsWith("en"));
  if (anyEnglish) {
    log("✓ Using voice: " + anyEnglish.name);
    return anyEnglish;
  }

  log("⚠ Using default voice: " + voices[0].name);
  return voices[0];
}

/* ============================
   IMPROVED TTS WITH CONSISTENCY
   ============================ */
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();

  const cleanedText = text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
  lastSpokenText = cleanedText;

  const utter = new SpeechSynthesisUtterance(cleanedText);
  
  // CONSISTENT VOICE SETTINGS across devices
  utter.lang = "en-US"; // Changed from en-IN for better consistency
  utter.volume = 1.0;
  
  // Device-specific tuning for consistency
  if (isMobileDevice()) {
    utter.rate = 0.92;  // Slightly slower on mobile
    utter.pitch = 1.18; // Teen female voice
  } else {
    utter.rate = 0.95;  // Desktop
    utter.pitch = 1.22; // Slightly higher on desktop to match mobile
  }

  const bestVoice = selectBestVoice();
  if (bestVoice) {
    utter.voice = bestVoice;
    log("Speaking with: " + bestVoice.name);
  }

  utter.onstart = function () {
    isSpeaking = true;
    if (avatarStartTalking) avatarStartTalking();
    showCaptionText(cleanedText);
    setStatus("💬", "speaking");
  };

  utter.onend = function () {
    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaptionText();

    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, 800);
    } else {
      setStatus("Your turn! 💭", "ready");
    }
  };

  utter.onerror = function (event) {
    console.error("TTS error:", event);
    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaptionText();
    setStatus("Oops! 😅", "error");
    
    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, 1500);
    }
  };

  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  if (avatarStopTalking) avatarStopTalking();
  hideCaptionText();
}

/* ============================
   IMPROVED SPEECH RECOGNITION
   ============================ */
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;

  setStatus("Listening... 👂", "listening");
  isListening = true;
  speechBuffer = "";
  
  // Use improved recognition with longer timeout
  startListening(handleUserSpeech, { 
    continuous: false,
    lang: "en-IN",
    interimResults: true // Enable interim results for better capture
  });
}

function handleUserSpeech(text, isFinal = true) {
  if (!text || !text.trim()) {
    if (isContinuousMode && isFinal) {
      setTimeout(startNextListeningCycle, 500);
    }
    return;
  }

  // Buffer speech until final result
  if (!isFinal) {
    speechBuffer = text;
    return;
  }

  // Use buffered text or current text
  const finalText = speechBuffer || text;
  speechBuffer = "";
  
  log("User said: " + finalText);
  sendToBackend(finalText);
}

/* ============================
   BACKEND COMMUNICATION
   ============================ */
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
    // Try to parse JSON response
    const cleaned = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    conversationHistory.push({ 
      role: "assistant", 
      content: parsed.reply 
    });
    saveConversationHistory();

    // Show correction UI
    if (parsed.correctness !== "correct") {
      showCorrection(
        userText,
        parsed.corrected,
        parsed.explanation,
        parsed.correctness
      );
    } else {
      showCorrection(userText, userText, "", "correct");
    }

    // Speak the reply
    speak(parsed.reply);
  } catch (e) {
    // Fallback if JSON parsing fails
    console.error("Failed to parse practice mode response:", e);
    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();
    speak(renderReplyMarkdown(reply));
  }
}

function handleCasualMode(reply) {
  conversationHistory.push({ role: "assistant", content: reply });
  saveConversationHistory();
  
  const speakable = renderReplyMarkdown(reply);
  speak(speakable);
}

/* ============================
   EVENT LISTENERS
   ============================ */

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

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    isPracticeMode = !isPracticeMode;
    modeToggle.classList.toggle("active", isPracticeMode);

    const label = modeToggle.querySelector(".mode-label");
    if (label) {
      label.textContent = isPracticeMode ? "Practice Mode" : "Casual Chat";
    }

    hideCorrection();
    log(isPracticeMode ? "📝 Practice Mode ON" : "💬 Casual Chat ON");
    setStatus(isPracticeMode ? "Practice Mode! 📝" : "Casual Chat! 💭", "ready");
  });
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (isContinuousMode) {
      isContinuousMode = false;
      stopListening();
      stopSpeech();
      isListening = false;

      micBtn.classList.remove("active");
      micBtn.textContent = "🎤";
      micBtn.title = "Start conversation";

      setStatus("Paused 💭", "ready");
      log("Continuous mode stopped");
    } else {
      isContinuousMode = true;
      micBtn.classList.add("active");
      micBtn.textContent = "⏸️";
      micBtn.title = "Pause conversation";

      setStatus("Listening... 👂", "listening");
      log("Continuous mode started");
      
      startNextListeningCycle();
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (!confirm("Start fresh? This will clear our chat history.")) return;

    clearConversationStorage();
    stopSpeech();
    hideCaptionText();
    hideCorrection();

    setStatus("Fresh start! 🌟", "ready");
    log("Chat cleared");

    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

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

/* ============================
   INITIALIZATION
   ============================ */
function initialize() {
  log("Anime Companion Ready! 💬");

  const hasHistory = loadConversationHistory();

  if (hasHistory) {
    log("✅ Previous conversation restored!");
    setStatus("Welcome back! 😊", "ready");
  } else {
    setStatus("Ready to chat! 💭", "ready");
  }

  // Load voices and log available options
  if (window.speechSynthesis) {
    let voices = window.speechSynthesis.getVoices();

    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      log(voices.length + " voices loaded");
      
      // Log female voices for debugging
      voices.filter(v => 
        v.lang.startsWith("en") && /female|woman/i.test(v.name)
      ).forEach(v => {
        console.log("✓ Female voice:", v.name, v.lang);
      });
    };

    if (isMobileDevice()) {
      setTimeout(() => window.speechSynthesis.getVoices(), 100);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) stopSpeech();
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (isListening) stopListening();
});