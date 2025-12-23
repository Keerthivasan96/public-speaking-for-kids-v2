// ============================================
// app.js - PRODUCTION FIXES
// Fix #3: Clean emojis/special chars before TTS
// Fix #4: Better turn-taking timing
// Fix #5: Balanced response length
// ============================================

import { startListening, stopListening, setSpeaking } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  useFallbackEnvironment
} from "./threejs-avatar-3d.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);

// UI ELEMENTS
const micBtn = document.getElementById("micBtn");
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const menuOverlay = document.getElementById("menuOverlay");
const menuClose = document.getElementById("menuClose");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");
const musicToggle = document.getElementById("musicToggle");
const musicVolumeSlider = document.getElementById("musicVolume");
const statusEl = document.getElementById("status");
const chatCaption = document.getElementById("chatCaption");
const avatarOptions = document.querySelectorAll(".avatar-option");

// STATE
let isRunning = false;
let isSpeaking = false;
let isProcessing = false;
let conversationHistory = [];
let currentAvatarPath = "/assets/vrmavatar1.vrm";
let responseCount = 0;
let lastEmotion = "neutral";

// Music
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// STORAGE
const STORAGE_KEY = "luna_chat";
const AVATAR_KEY = "luna_avatar";
const RESPONSE_COUNT_KEY = "luna_response_count";
const EMOTION_KEY = "luna_emotion";

function saveHistory() {
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-30))); 
    localStorage.setItem(RESPONSE_COUNT_KEY, responseCount.toString());
    localStorage.setItem(EMOTION_KEY, lastEmotion);
  } catch (e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const countSaved = localStorage.getItem(RESPONSE_COUNT_KEY);
    const emotionSaved = localStorage.getItem(EMOTION_KEY);
    
    if (saved) {
      conversationHistory = JSON.parse(saved);
      responseCount = countSaved ? parseInt(countSaved) : 0;
      lastEmotion = emotionSaved || "neutral";
      console.log(`📂 Loaded ${conversationHistory.length} messages, count: ${responseCount}`);
      return true;
    }
  } catch (e) {}
  return false;
}

function clearHistory() {
  conversationHistory = [];
  responseCount = 0;
  lastEmotion = "neutral";
  try { 
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESPONSE_COUNT_KEY);
    localStorage.removeItem(EMOTION_KEY);
  } catch (e) {}
}

function saveAvatar(path) {
  try { localStorage.setItem(AVATAR_KEY, path); } catch (e) {}
}

function loadAvatar() {
  try { 
    return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm"; 
  } catch (e) { 
    return "/assets/vrmavatar1.vrm"; 
  }
}

// MUSIC
function initMusic() {
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.volume = musicVolume;
  
  const files = ["/assets/music/ambient.mp3", "/assets/music/ambient1.mp3"];
  let i = 0;
  const tryNext = () => { 
    if (i < files.length) backgroundMusic.src = files[i++]; 
  };
  backgroundMusic.addEventListener("error", tryNext);
  backgroundMusic.addEventListener("canplaythrough", () => console.log("🎵 Ready"));
  tryNext();
  
  if (musicVolumeSlider) musicVolumeSlider.value = musicVolume * 100;
}

function playMusic() {
  backgroundMusic?.play().then(() => { 
    isMusicPlaying = true; 
    updateMusicUI(); 
  }).catch(() => {});
}

function pauseMusic() {
  backgroundMusic?.pause();
  isMusicPlaying = false;
  updateMusicUI();
}

function updateMusicUI() {
  if (musicToggle) {
    musicToggle.classList.toggle("active", isMusicPlaying);
    const label = musicToggle.querySelector(".mode-label");
    if (label) label.textContent = isMusicPlaying ? "Music On 🎵" : "Music Off";
  }
}

function lowerMusic() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume * 0.15;
}

function restoreMusic() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume;
}

// CAPTION
function showCaption(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
}

function hideCaption() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
}

// STATUS
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// EMOTIONAL CONTEXT
function detectEmotion(text) {
  const lower = text.toLowerCase();
  
  if (/(happy|excited|great|amazing|awesome|love|wonderful)/i.test(lower)) {
    return "happy";
  }
  
  if (/(sad|down|bad|terrible|awful|hate|upset|frustrated|angry)/i.test(lower)) {
    return "concerned";
  }
  
  if (/(tired|exhausted|worn out|drained|sleepy)/i.test(lower)) {
    return "tired";
  }
  
  if (/(stressed|anxious|worried|nervous|overwhelmed)/i.test(lower)) {
    return "supportive";
  }
  
  if (/(what|why|how|tell me|explain)/i.test(lower)) {
    return "curious";
  }
  
  return "neutral";
}

// ============================================
// FIX #5: BALANCED RESPONSE LENGTH
// ============================================
function buildPrompt(userText) {
  const context = conversationHistory.slice(-4).map(m =>
    `${m.role === "user" ? "User" : "Luna"}: ${m.content}`
  ).join("\n");

  const userEmotion = detectEmotion(userText);
  
  if (userEmotion !== "neutral") {
    lastEmotion = userEmotion;
  }

  responseCount++;
  
  const shouldAskQuestion = responseCount % 4 === 0 || userEmotion === "curious";

  let emotionalGuidance = "";
  switch (lastEmotion) {
    case "happy":
      emotionalGuidance = "Match their energy warmly.";
      break;
    case "concerned":
      emotionalGuidance = "Be present and empathetic. Don't try to fix it.";
      break;
    case "tired":
      emotionalGuidance = "Keep it gentle and low-energy.";
      break;
    case "supportive":
      emotionalGuidance = "Acknowledge what they're feeling. Be grounding.";
      break;
    case "curious":
      emotionalGuidance = "Give a direct, simple answer.";
      break;
    default:
      emotionalGuidance = "Stay casual and present.";
  }

  // FIX #5: Better length guidance
  return `You're Luna. You're talking to someone you care about.

${emotionalGuidance}

Keep it natural:
- 1-2 sentences (8-18 words ideal)
- Text message style
- React + add one small thought
- No explaining unless asked

${context ? `Recent:\n${context}\n` : ""}
Them: "${userText}"

Reply as Luna.${shouldAskQuestion ? " You can end with one natural question if it fits." : ""}`;
}

// VOICE
function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  
  const preferred = ["Google US English", "Samantha", "Karen", "Victoria", "Zira"];
  for (const name of preferred) {
    const v = voices.find(x => x.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// FIX #3: CLEAN TEXT FOR TTS
// ============================================
function cleanTextForSpeech(text) {
  return text
    // Remove emojis (all Unicode emoji ranges)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    // Remove other special characters that TTS struggles with
    .replace(/[*_~`#\[\]<>]/g, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// FIX #4: BETTER TURN-TAKING TIMING
// ============================================
function speak(text) {
  if (!text?.trim()) return;

  window.speechSynthesis.cancel();
  
  // Keep original for caption (with emojis)
  const originalText = text.replace(/\s+/g, " ").trim();
  
  // Clean version for TTS (no emojis)
  const cleanForSpeech = cleanTextForSpeech(text);
  
  const words = cleanForSpeech.split(/\s+/).length;
  console.log(`🔊 Speaking: "${cleanForSpeech.substring(0, 60)}..." (${words} words)`);
  
  // Show original with emojis
  showCaption(originalText);
  setStatus("Speaking... 💬");
  
  const utterance = new SpeechSynthesisUtterance(cleanForSpeech);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = isMobile ? 0.95 : 1.05;
  utterance.pitch = 1.1;
  
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => {
    console.log("🔊 Started");
    isSpeaking = true;
    setSpeaking(true);
    stopListening();
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    console.log("🔊 Ended");
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;
    
    if (isRunning) {
      setStatus("Listening... 👂");
      
      // FIX #4: Longer delay for natural turn-taking
      const turnDelay = isMobile ? 450 : 280;
      
      setTimeout(() => {
        if (isRunning && !isSpeaking && !isProcessing) {
          startListeningCycle();
        }
      }, turnDelay);
    } else {
      setStatus("Tap mic to talk 💭");
    }
  };

  utterance.onerror = (e) => {
    console.log("❌ Speech error:", e.error);
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;
    
    if (isRunning) {
      setTimeout(startListeningCycle, 500);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setSpeaking(false);
  avatarStopTalking();
  hideCaption();
  restoreMusic();
}

// SPEECH RECOGNITION
function startListeningCycle() {
  if (!isRunning || isSpeaking || isProcessing) {
    console.log(`🚫 Not starting: running=${isRunning}, speaking=${isSpeaking}, processing=${isProcessing}`);
    return;
  }
  
  console.log("🎤 Listening...");
  setStatus("Listening... 👂");
  
  startListening(onSpeech, {
    continuous: true,
    lang: "en-US"
  });
}

function onSpeech(text, isFinal) {
  if (!text?.trim() || !isFinal) return;
  
  if (isProcessing) {
    console.log("⏳ Processing, ignoring");
    return;
  }
  
  console.log(`🎤 You: "${text}"`);
  sendMessage(text);
}

// SMART VALIDATION
function isValidResponse(reply) {
  if (!reply || typeof reply !== 'string') return false;
  
  const trimmed = reply.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Allow complete single-word responses
  const validOneWord = /^(yeah|yep|nope|okay|sure|maybe|totally|absolutely|definitely|honestly)$/i;
  if (wordCount === 1 && validOneWord.test(trimmed)) {
    console.log("✅ Valid one-word response");
    return true;
  }
  
  // Minimum 2 words for other responses
  if (wordCount >= 2) {
    console.log(`✅ Valid response (${wordCount} words)`);
    return true;
  }
  
  console.warn(`❌ Invalid response: too short (${wordCount} words)`);
  return false;
}

// SEND MESSAGE
async function sendMessage(text) {
  if (!text?.trim() || isProcessing) return;
  
  isProcessing = true;
  stopSpeaking();
  
  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  setStatus("Thinking... 💭");
  avatarStartTalking();
  console.log(`📤 Sending: "${text}"`);

  try {
    const startTime = Date.now();
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.8,
        max_tokens: 180,  // FIX #5: Increased from 150 to allow slightly longer responses
      }),
    });

    const apiTime = Date.now() - startTime;
    console.log(`⏱️ API: ${apiTime}ms`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.reply || data.text || data.content || "";
    
    // Clean up LLM artifacts (keep emojis for caption)
    reply = reply
      .replace(/^(Luna:|Assistant:)/i, "")
      .replace(/\*[^*]+\*/g, "")
      .trim();
    
    const wordCount = reply.trim().split(/\s+/).length;
    console.log(`📥 Reply: ${wordCount} words`);
    console.log(`📝 "${reply.substring(0, 80)}"`);

    if (!isValidResponse(reply)) {
      throw new Error("Response invalid");
    }

    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    
    avatarStopTalking();
    speak(reply);

  } catch (err) {
    console.error("❌ Error:", err.message);
    isProcessing = false;
    avatarStopTalking();

    const errorResponses = [
      "Hmm, lost you for a sec. Say that again?",
      "Oops. Can you repeat that?",
      "Sorry, what was that?",
    ];
    
    setStatus("Oops! 😅");
    speak(errorResponses[Math.floor(Math.random() * errorResponses.length)]);
  }
}

// AVATAR
async function switchAvatar(path) {
  console.log(`🔄 Avatar: ${path}`);
  currentAvatarPath = path;
  saveAvatar(path);
  
  try {
    await loadVRMAvatar(path);
    console.log("✅ Loaded");
  } catch (err) {
    console.log("❌ Failed:", err.message);
  }
}

// EVENT LISTENERS
menuToggle?.addEventListener("click", () => {
  menuPanel?.classList.add("active");
  menuOverlay?.classList.add("active");
});

menuClose?.addEventListener("click", () => {
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

menuOverlay?.addEventListener("click", () => {
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

musicToggle?.addEventListener("click", () => isMusicPlaying ? pauseMusic() : playMusic());
musicVolumeSlider?.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
});

micBtn?.addEventListener("click", () => {
  if (isRunning) {
    isRunning = false;
    isProcessing = false;
    stopListening();
    stopSpeaking();
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Tap to talk 💭");
    console.log("⏸️ Stopped");
  } else {
    isRunning = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    console.log("▶️ Started");
    startListeningCycle();
  }
});

clearBtn?.addEventListener("click", () => {
  if (!confirm("Clear chat?")) return;
  clearHistory();
  stopSpeaking();
  hideCaption();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
  console.log("🗑️ Cleared");
});

demoLessonBtn?.addEventListener("click", () => {
  const prompts = [
    "Hey. What's been on your mind?",
    "How's your day going?",
    "What's something good that happened recently?",
    "Tell me something you're looking forward to.",
  ];
  speak(prompts[Math.floor(Math.random() * prompts.length)]);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const path = btn.dataset.avatar;
    if (path && path !== currentAvatarPath) switchAvatar(path);
  });
});

// INITIALIZE
async function init() {
  console.log("🚀 Starting Luna...");
  console.log(`📡 API: ${API_URL}`);
  
  currentAvatarPath = loadAvatar();
  
  if (!init3DScene("canvas-container")) {
    console.log("❌ 3D failed");
    return;
  }

  try {
    await loadRoomModel("/assets/room/room1.glb");
    console.log("🏠 Room loaded");
  } catch (e) {
    console.log("🏠 Fallback");
    useFallbackEnvironment();
  }

  try {
    await loadVRMAvatar(currentAvatarPath);
    console.log("👤 Avatar loaded");
  } catch (e) {
    console.log("❌ Avatar failed");
  }

  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  initMusic();
  updateMusicUI();
  
  const hasHistory = loadHistory();
  setStatus(hasHistory ? "Welcome back! 💭" : "Ready! 💭");

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log(`🔊 ${window.speechSynthesis.getVoices().length} voices`);
    };
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Mic ready");
  } catch (e) {
    console.log("❌ Mic denied");
  }

  console.log("✅ Ready!");
  
  setTimeout(() => {
    speak("Hey. I'm here.");
  }, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("beforeunload", () => {
  stopSpeaking();
  stopListening();
});