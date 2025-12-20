// ============================================
// app.js - LUNA AI COMPANION
// Clean Replika-style chat experience
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
let isProcessing = false;  // Prevents double-sends
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-30))); } catch(e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      console.log(`📂 Loaded ${conversationHistory.length} messages`);
      return true;
    }
  } catch(e) {}
  return false;
}

function clearHistory() {
  conversationHistory = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
}

function saveAvatar(path) {
  try { localStorage.setItem(AVATAR_KEY, path); } catch(e) {}
}

function loadAvatar() {
  try { return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm"; }
  catch(e) { return "/assets/vrmavatar1.vrm"; }
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
  const tryNext = () => { if (i < files.length) backgroundMusic.src = files[i++]; };
  backgroundMusic.addEventListener("error", tryNext);
  backgroundMusic.addEventListener("canplaythrough", () => console.log("🎵 Music ready"));
  tryNext();
  
  if (musicVolumeSlider) musicVolumeSlider.value = musicVolume * 100;
}

function playMusic() {
  backgroundMusic?.play().then(() => { isMusicPlaying = true; updateMusicUI(); }).catch(() => {});
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
// CAPTION - Fixed for smooth display
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
// PROMPT - Replika Style (Clean & Effective)
// ============================================
function buildPrompt(userText) {
  // Last 3 exchanges for context
  const context = conversationHistory.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Luna"}: ${m.content}`
  ).join("\n");

  return `You are Luna — a warm, emotionally present AI companion.

Voice: Friendly, caring, like a close friend. Natural and genuine.
Length: 2-4 sentences, 40-60 words. Complete your thoughts fully.
Style: Use contractions. Be warm. One follow-up question is nice.

${context ? `Chat:\n${context}\n\n` : ""}User: "${userText}"

Luna:`;
}

// ============================================
// VOICE
// ============================================
function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  
  const preferred = ["Google US English", "Samantha", "Karen", "Victoria"];
  for (const name of preferred) {
    const v = voices.find(x => x.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// SPEAK - Clean implementation
// ============================================
function speak(text) {
  if (!text?.trim()) return;

  // Cancel any existing speech
  window.speechSynthesis.cancel();
  
  const clean = text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
  
  console.log(`🔊 Speaking: "${clean.substring(0, 50)}..."`);
  
  // Show caption FIRST
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
    isSpeaking = true;
    setSpeaking(true);
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    console.log("🔊 Done");
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;  // Allow new messages
    
    if (isRunning) {
      setStatus("Listening... 👂");
      setTimeout(() => {
        if (isRunning && !isSpeaking) {
          startListeningCycle();
        }
      }, isMobile ? 500 : 300);
    } else {
      setStatus("Tap mic to talk 💭");
    }
  };

  utterance.onerror = (e) => {
    console.log("🔊 Error:", e.error);
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

  // Small delay for smooth transition
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
  
  setStatus("Listening... 👂");
  
  startListening(onSpeech, {
    continuous: true,
    lang: "en-US"
  });
}

function onSpeech(text, isFinal) {
  if (!text?.trim() || !isFinal) return;
  
  // Prevent double processing
  if (isProcessing) {
    console.log("⏳ Already processing, skip");
    return;
  }
  
  console.log(`🎤 You: "${text}"`);
  sendMessage(text);
}

// ============================================
// SEND MESSAGE
// ============================================
async function sendMessage(text) {
  if (!text?.trim()) return;
  if (isProcessing) return;  // Guard against double-send
  
  isProcessing = true;
  stopSpeaking();
  stopListening();
  
  // Add to history
  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  setStatus("Thinking... 💭");
  console.log(`📤 Sending: "${text}"`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.85,
        max_tokens: 300,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const reply = data.reply || data.text || "";
    
    console.log(`📥 Reply: "${reply.substring(0, 60)}..."`);

    if (!reply || reply.length < 5) {
      throw new Error("Empty response");
    }

    // Add to history
    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    
    // Speak reply
    speak(reply);

  } catch (err) {
    console.error("❌ Error:", err.message);
    isProcessing = false;
    setStatus("Oops! 😅");
    speak("Sorry, I had a little trouble there. Can you say that again?");
  }
}

// ============================================
// AVATAR
// ============================================
async function switchAvatar(path) {
  console.log(`🔄 Loading: ${path}`);
  currentAvatarPath = path;
  saveAvatar(path);
  
  try {
    await loadVRMAvatar(path);
    console.log("✅ Avatar loaded");
  } catch (err) {
    console.log(`❌ Avatar error: ${err.message}`);
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

// Microphone - Main toggle
micBtn?.addEventListener("click", () => {
  if (isRunning) {
    // STOP
    isRunning = false;
    isProcessing = false;
    stopListening();
    stopSpeaking();
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Tap mic to talk 💭");
    console.log("⏸️ Stopped");
  } else {
    // START
    isRunning = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    console.log("▶️ Started");
    startListeningCycle();
  }
});

// Clear history
clearBtn?.addEventListener("click", () => {
  if (!confirm("Start fresh?")) return;
  clearHistory();
  stopSpeaking();
  hideCaption();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Demo prompts
demoLessonBtn?.addEventListener("click", () => {
  const prompts = [
    "Tell me something interesting about yourself!",
    "What's a fun memory you have?",
    "If you could go anywhere, where would it be?",
    "What made you smile recently?",
  ];
  speak(prompts[Math.floor(Math.random() * prompts.length)]);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Avatar selection
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
  console.log("🚀 Starting Luna...");
  
  currentAvatarPath = loadAvatar();
  
  // Init 3D
  if (!init3DScene("canvas-container")) {
    console.log("❌ 3D failed");
    return;
  }

  // Load room
  try {
    await loadRoomModel("/assets/room/room1.glb");
    console.log("🏠 Room loaded");
  } catch (e) {
    useFallbackEnvironment();
  }

  // Load avatar
  try {
    await loadVRMAvatar(currentAvatarPath);
    console.log("👤 Avatar loaded");
  } catch (e) {
    console.log("❌ Avatar error");
  }

  // Mark active avatar
  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  // Init music
  initMusic();
  updateMusicUI();

  // Load history
  loadHistory();
  setStatus("Ready to chat! 💭");

  // Load voices
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log(`🔊 ${window.speechSynthesis.getVoices().length} voices`);
    };
  }

  // Mic permission
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Mic ready");
  } catch (e) {
    console.log("❌ Mic denied");
  }

  console.log("✅ Ready!");
  
  // Welcome message
  setTimeout(() => {
    speak("Hey! I'm Luna. How's your day going?");
  }, 1000);
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Cleanup
window.addEventListener("beforeunload", () => {
  stopSpeaking();
  stopListening();
});