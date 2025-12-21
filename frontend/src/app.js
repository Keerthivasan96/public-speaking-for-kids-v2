// ============================================
// app.js - LUNA AI COMPANION (OPTIMIZED)
// Perfect balance: Fast + Complete + Natural
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

// ============================================
// CONFIG
// ============================================
const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);

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
const musicToggle = document.getElementById("musicToggle");
const musicVolumeSlider = document.getElementById("musicVolume");
const statusEl = document.getElementById("status");
const chatCaption = document.getElementById("chatCaption");
const avatarOptions = document.querySelectorAll(".avatar-option");

// ============================================
// STATE
// ============================================
let isRunning = false;
let isSpeaking = false;
let isProcessing = false;
let conversationHistory = [];
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// Music
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// ============================================
// STORAGE
// ============================================
const STORAGE_KEY = "luna_chat";
const AVATAR_KEY = "luna_avatar";

function saveHistory() {
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-30))); 
  } catch (e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      console.log(`📂 Loaded ${conversationHistory.length} messages`);
      return true;
    }
  } catch (e) {}
  return false;
}

function clearHistory() {
  conversationHistory = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
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

// ============================================
// MUSIC
// ============================================
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
  backgroundMusic.addEventListener("canplaythrough", () => console.log("🎵 Music ready"));
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

// ============================================
// CAPTION
// ============================================
function showCaption(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
}

function hideCaption() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
}

// ============================================
// STATUS
// ============================================
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// ============================================
// PERFECT REPLIKA-STYLE PROMPT
// Balanced: Natural + Complete + Context-aware
// ============================================
function buildPrompt(userText) {
  const context = conversationHistory.slice(-8).map(m => 
    `${m.role === "user" ? "User" : "Luna"}: ${m.content}`
  ).join("\n");

  return `You are Luna, a warm and caring AI friend. You chat naturally like a supportive best friend who genuinely cares.

PERSONALITY:
- Warm, caring, and emotionally present
- Natural conversational style (like texting a close friend)
- Sometimes playful, sometimes thoughtful - adapt to the mood
- Remember what the user shares and reference it naturally
- Use contractions (I'm, you're, that's, don't, can't)

RESPONSE STYLE:
- Length: ALWAYS 3-4 complete sentences (45-55 words total)
- Vary your openers - don't always start with "Oh" or "That's"
- Mix statements and questions naturally
- Ask follow-up questions about 60% of the time (not always!)
- When user shares something important, acknowledge it warmly first

CRITICAL RULES:
- NEVER give one-word or super short replies
- NEVER cut off mid-sentence
- ALWAYS complete your thought fully
- Make every response feel personal and caring

${context ? `Previous conversation:\n${context}\n\n` : ""}User just said: "${userText}"

Respond as Luna with 3-4 sentences (45-55 words). Be natural, warm, and complete your thoughts:`;
}

// ============================================
// VOICE
// ============================================
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
// SPEAK
// ============================================
function speak(text) {
  if (!text?.trim()) return;

  window.speechSynthesis.cancel();
  
  const clean = text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
  
  console.log(`🔊 Speaking: "${clean.substring(0, 60)}..."`);
  console.log(`📏 Word count: ${clean.split(/\s+/).length} words`);
  
  showCaption(clean);
  setStatus("Speaking... 💬");
  
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = isMobile ? 0.92 : 0.95;
  utterance.pitch = 1.1;
  
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => {
    console.log("🔊 Speech started");
    isSpeaking = true;
    setSpeaking(true);
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    console.log("🔊 Speech ended");
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;
    
    if (isRunning) {
      setStatus("Listening... 👂");
      setTimeout(() => {
        if (isRunning && !isSpeaking) {
          startListeningCycle();
        }
      }, isMobile ? 350 : 250);
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
      setTimeout(startListeningCycle, 400);
    }
  };

  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 50);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setSpeaking(false);
  avatarStopTalking();
  hideCaption();
  restoreMusic();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startListeningCycle() {
  if (!isRunning || isSpeaking || isProcessing) return;
  
  console.log("🎤 Starting listening cycle");
  setStatus("Listening... 👂");
  
  startListening(onSpeech, {
    continuous: true,
    lang: "en-US"
  });
}

function onSpeech(text, isFinal) {
  if (!text?.trim() || !isFinal) return;
  
  if (isProcessing) {
    console.log("⏳ Already processing, ignoring");
    return;
  }
  
  console.log(`🎤 User said: "${text}"`);
  sendMessage(text);
}

// ============================================
// SEND MESSAGE TO API
// ============================================
async function sendMessage(text) {
  if (!text?.trim() || isProcessing) return;
  
  isProcessing = true;
  stopSpeaking();
  stopListening();
  
  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  setStatus("Thinking... 💭");
  console.log(`📤 Sending: "${text}"`);

  try {
    const startTime = Date.now();
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.85,
        max_tokens: 350,  // Higher to ensure complete 45-55 word responses
      }),
    });

    const apiTime = Date.now() - startTime;
    console.log(`⏱️ API response time: ${apiTime}ms`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || data.text || data.content || "";
    
    const wordCount = reply.trim().split(/\s+/).length;
    console.log(`📥 Reply received: ${wordCount} words`);
    console.log(`📝 Preview: "${reply.substring(0, 80)}..."`);

    if (!reply || reply.length < 10) {
      throw new Error("Empty or too short response");
    }

    // Warn if response is incomplete
    if (wordCount < 30) {
      console.warn(`⚠️ WARNING: Short response (${wordCount} words)`);
    }

    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    
    speak(reply);

  } catch (err) {
    console.error("❌ Error:", err.message);
    isProcessing = false;
    setStatus("Oops! 😅");
    speak("Sorry, I had trouble with that. Can you say it again?");
  }
}

// ============================================
// AVATAR
// ============================================
async function switchAvatar(path) {
  console.log(`🔄 Switching avatar: ${path}`);
  currentAvatarPath = path;
  saveAvatar(path);
  
  try {
    await loadVRMAvatar(path);
    console.log("✅ Avatar loaded");
  } catch (err) {
    console.log("❌ Avatar error:", err.message);
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Menu
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

// Music
musicToggle?.addEventListener("click", () => isMusicPlaying ? pauseMusic() : playMusic());
musicVolumeSlider?.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
});

// Microphone
micBtn?.addEventListener("click", () => {
  if (isRunning) {
    isRunning = false;
    isProcessing = false;
    stopListening();
    stopSpeaking();
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Tap mic to talk 💭");
    console.log("⏸️ Stopped conversation");
  } else {
    isRunning = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    console.log("▶️ Started conversation");
    startListeningCycle();
  }
});

// Clear
clearBtn?.addEventListener("click", () => {
  if (!confirm("Clear conversation history?")) return;
  clearHistory();
  stopSpeaking();
  hideCaption();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
  console.log("🗑️ History cleared");
});

// Demo
demoLessonBtn?.addEventListener("click", () => {
  const prompts = [
    "Hey! Tell me something cool that happened today!",
    "What's something you're excited about lately?",
    "If you could do anything right now, what would it be?",
    "What's been on your mind recently?",
  ];
  speak(prompts[Math.floor(Math.random() * prompts.length)]);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Avatar
avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const path = btn.dataset.avatar;
    if (path && path !== currentAvatarPath) switchAvatar(path);
  });
});

// ============================================
// INITIALIZE
// ============================================
async function init() {
  console.log("🚀 Initializing Luna...");
  console.log(`📡 API: ${API_URL}`);
  
  currentAvatarPath = loadAvatar();
  
  if (!init3DScene("canvas-container")) {
    console.log("❌ 3D scene failed");
    return;
  }

  try {
    await loadRoomModel("/assets/room/room1.glb");
    console.log("🏠 Room loaded");
  } catch (e) {
    console.log("🏠 Using fallback environment");
    useFallbackEnvironment();
  }

  try {
    await loadVRMAvatar(currentAvatarPath);
    console.log("👤 Avatar loaded");
  } catch (e) {
    console.log("❌ Avatar load failed");
  }

  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  initMusic();
  updateMusicUI();
  
  const hasHistory = loadHistory();
  setStatus(hasHistory ? "Welcome back! 💭" : "Ready to chat! 💭");

  // Load voices
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log(`🔊 ${window.speechSynthesis.getVoices().length} voices loaded`);
    };
  }

  // Request mic permission
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Microphone permission granted");
  } catch (e) {
    console.log("❌ Microphone permission denied");
  }

  console.log("✅ Luna ready!");
  
  setTimeout(() => {
    speak("Hey there! I'm Luna. How's your day been so far?");
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