// ============================================
// app.js - REPLIKA-STYLE COMPANION
// Fixed for proper responses and low latency
// ============================================

import { startListening, stopListening } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  useFallbackEnvironment,
  setExpression
} from "./threejs-avatar-3d.js";

// ============================================
// API CONFIGURATION
// ============================================
const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// ============================================
// DEVICE DETECTION
// ============================================
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

console.log(`📱 Device: ${IS_MOBILE ? 'Mobile' : 'Desktop'}`);

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
const musicToggle = document.getElementById("musicToggle");
const musicVolumeSlider = document.getElementById("musicVolume");

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const chatCaption = document.getElementById("chatCaption");
const correctionDisplay = document.getElementById("correctionDisplay");
const correctionContent = document.getElementById("correctionContent");

const avatarOptions = document.querySelectorAll(".avatar-option");

// ============================================
// STATE
// ============================================
let isListening = false;
let isSpeaking = false;
let isContinuousMode = false;
let conversationHistory = [];
let isPracticeMode = false;
let speechBuffer = "";
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// Music
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// ============================================
// STORAGE
// ============================================
const STORAGE_KEY = "luna_conversation";
const AVATAR_KEY = "luna_avatar";
const MUSIC_KEY = "luna_music";
const VOLUME_KEY = "luna_volume";

// ============================================
// LOGGING
// ============================================
function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
  if (logEl) {
    logEl.innerHTML += `<span style="color:#888">[${time}]</span> ${msg}<br>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ============================================
// STORAGE FUNCTIONS
// ============================================
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-50)));
  } catch(e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      log(`📂 Loaded ${conversationHistory.length} messages`);
      return true;
    }
  } catch(e) {}
  return false;
}

function clearHistory() {
  conversationHistory = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  log("🗑️ History cleared");
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
  
  const files = ["/assets/music/ambient.mp3", "/assets/music/ambient1.mp3", "/assets/music/background.mp3"];
  let i = 0;
  
  function tryNext() {
    if (i >= files.length) return;
    backgroundMusic.src = files[i++];
  }
  
  backgroundMusic.addEventListener("error", tryNext);
  backgroundMusic.addEventListener("canplaythrough", () => log("🎵 Music ready"));
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
  if (chatCaption) {
    chatCaption.textContent = text;
    chatCaption.classList.add("active");
  }
}

function hideCaption() {
  if (chatCaption) chatCaption.classList.remove("active");
}

// ============================================
// STATUS
// ============================================
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// ============================================
// CORRECTION DISPLAY (Practice Mode)
// ============================================
function showCorrection(userText, corrected, explanation, status) {
  if (!correctionContent || !correctionDisplay) return;
  
  const isCorrect = status === "correct";
  const isAlmost = status === "almost";
  
  correctionContent.innerHTML = `
    <div style="padding:12px;background:${isCorrect ? '#e8f5e9' : isAlmost ? '#fff8e1' : '#ffebee'};border-radius:8px;">
      <div style="font-weight:bold;margin-bottom:8px;">
        ${isCorrect ? '✅ Perfect!' : isAlmost ? '⚠️ Almost!' : '❌ Let\'s improve'}
      </div>
      <div style="margin-bottom:6px;"><b>You said:</b> "${userText}"</div>
      ${!isCorrect ? `<div style="color:#2e7d32;margin-bottom:6px;"><b>Better:</b> "${corrected}"</div>` : ''}
      ${explanation ? `<div style="font-size:13px;color:#666;">💡 ${explanation}</div>` : ''}
    </div>
  `;
  correctionDisplay.style.display = "block";
}

function hideCorrection() {
  if (correctionDisplay) correctionDisplay.style.display = "none";
}

// ============================================
// PROMPT BUILDER - REPLIKA STYLE (CONCISE)
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are Luna, a friendly English tutor. Analyze this sentence for grammar.

Student said: "${userText}"

Respond in JSON format only:
{"correctness":"correct/almost/wrong","corrected":"corrected sentence","explanation":"brief tip","reply":"short encouraging response (1-2 sentences)"}`;
  }

  // Get recent context (last 3 exchanges only)
  const context = conversationHistory.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Luna"}: ${m.content}`
  ).join("\n");

  return `You are Luna, a warm AI companion and friend.

STYLE: Friendly, natural, like texting a close friend. Use contractions.

RESPONSE LENGTH: 3-5 short sentences (45 -50 words max). Be concise but warm.

${context ? `Recent chat:\n${context}\n` : ""}
User: "${userText}"

Luna:`;
}

// ============================================
// VOICE SELECTION
// ============================================
function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  
  // Prefer these voices
  const preferred = ["Google US English", "Samantha", "Karen", "Victoria", "Zira", "Google UK English Female"];
  for (const name of preferred) {
    const v = voices.find(x => x.name.includes(name));
    if (v) return v;
  }
  
  // Any English voice
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// SPEAK
// ============================================
function speak(text) {
  if (!text?.trim()) {
    log("⚠️ Empty text");
    return;
  }

  log(`🔊 Speaking: "${text.substring(0, 60)}..."`);
  
  window.speechSynthesis.cancel();
  
  const clean = text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
  showCaption(clean);
  setStatus("Speaking... 💬");
  
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = IS_MOBILE ? 0.92 : 0.95;
  utterance.pitch = 1.1;
  
  const voice = getBestVoice();
  if (voice) {
    utterance.voice = voice;
    log(`🎤 Voice: ${voice.name}`);
  }

  utterance.onstart = () => {
    isSpeaking = true;
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    log("🔊 Done speaking");
    isSpeaking = false;
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    
    if (isContinuousMode) {
      setTimeout(startListeningCycle, IS_MOBILE ? 800 : 500);
    } else {
      setStatus("Your turn! 💭");
    }
  };

  utterance.onerror = (e) => {
    log(`❌ Speech error: ${e.error}`);
    isSpeaking = false;
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    if (isContinuousMode) setTimeout(startListeningCycle, 1000);
  };

  setTimeout(() => window.speechSynthesis.speak(utterance), 100);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  avatarStopTalking();
  hideCaption();
  restoreMusic();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;
  
  setStatus("Listening... 👂");
  isListening = true;
  speechBuffer = "";
  
  startListening(onSpeech, {
    continuous: false,
    lang: "en-US",
    interimResults: true
  });
}

function onSpeech(text, isFinal) {
  if (!text?.trim()) {
    if (isContinuousMode && isFinal) setTimeout(startListeningCycle, 400);
    return;
  }

  if (!isFinal) {
    speechBuffer = text;
    showCaption(`You: ${text}...`);
    return;
  }

  const finalText = speechBuffer || text;
  speechBuffer = "";
  hideCaption();
  log(`🎤 You said: "${finalText}"`);
  
  sendMessage(finalText);
}

// ============================================
// SEND MESSAGE TO BACKEND
// ============================================
async function sendMessage(text) {
  if (!text?.trim()) return;

  stopSpeaking();
  
  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  setStatus("Thinking... 💭");
  log(`📤 Sending: "${text}"`);

  try {
    const prompt = buildPrompt(text);
    log(`📝 Prompt: ${prompt.length} chars`);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt,
        temperature: isPracticeMode ? 0.4 : 0.85,
        max_tokens: 200,  // Reduced for concise responses
      }),
    });

    log(`📥 Status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || data.text || "";
    
    log(`📥 Reply (${reply.length} chars): "${reply.substring(0, 80)}..."`);

    if (!reply || reply.length < 5) {
      throw new Error("Empty or too short response");
    }

    if (isPracticeMode) {
      handlePracticeResponse(text, reply);
    } else {
      handleChatResponse(reply);
    }

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    setStatus("Oops! 😅");
    speak("Sorry, I had a little trouble there. Could you say that again?");
  }
}

function handlePracticeResponse(userText, reply) {
  try {
    const cleaned = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    
    conversationHistory.push({ role: "assistant", content: parsed.reply || reply });
    saveHistory();
    
    showCorrection(userText, parsed.corrected || userText, parsed.explanation || "", parsed.correctness || "wrong");
    speak(parsed.reply || "Good try! Keep practicing.");
  } catch (e) {
    log("⚠️ Parse failed, using raw");
    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    speak(reply);
  }
}

function handleChatResponse(reply) {
  conversationHistory.push({ role: "assistant", content: reply });
  saveHistory();
  speak(reply);
}

// ============================================
// AVATAR
// ============================================
async function switchAvatar(path) {
  log(`🔄 Loading avatar: ${path}`);
  currentAvatarPath = path;
  saveAvatar(path);
  
  try {
    await loadVRMAvatar(path);
    log("✅ Avatar loaded");
  } catch (err) {
    log(`❌ Avatar failed: ${err.message}`);
    if (path !== "/assets/vrmavatar1.vrm") {
      try {
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
      } catch(e) {}
    }
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

// Mode toggle
modeToggle?.addEventListener("click", () => {
  isPracticeMode = !isPracticeMode;
  modeToggle.classList.toggle("active", isPracticeMode);
  const label = modeToggle.querySelector(".mode-label");
  if (label) label.textContent = isPracticeMode ? "Practice Mode" : "Chat Mode";
  hideCorrection();
  log(isPracticeMode ? "📝 Practice Mode" : "💬 Chat Mode");
});

// Music
musicToggle?.addEventListener("click", () => isMusicPlaying ? pauseMusic() : playMusic());
musicVolumeSlider?.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
});

// Microphone
micBtn?.addEventListener("click", () => {
  if (isContinuousMode) {
    // Stop
    isContinuousMode = false;
    stopListening();
    stopSpeaking();
    isListening = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Paused 💭");
    log("⏸️ Stopped");
  } else {
    // Start
    isContinuousMode = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    log("▶️ Started");
    startListeningCycle();
  }
});

// Clear
clearBtn?.addEventListener("click", () => {
  if (!confirm("Start fresh conversation?")) return;
  clearHistory();
  stopSpeaking();
  hideCaption();
  hideCorrection();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Demo
demoLessonBtn?.addEventListener("click", () => {
  const prompts = [
    "Tell me about something fun you did recently!",
    "What's your favorite thing to do on weekends?",
    "If you could travel anywhere, where would you go?",
    "What's something that made you smile today?",
    "Tell me about your favorite movie or show!",
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
  log("🚀 Starting Luna...");
  
  currentAvatarPath = loadAvatar();
  
  // Init 3D scene
  if (!init3DScene("canvas-container")) {
    log("❌ 3D failed");
    return;
  }

  // Load room
  try {
    await loadRoomModel("/assets/room/room1.glb");
    log("🏠 Room loaded");
  } catch (e) {
    log("🏠 Using fallback");
    useFallbackEnvironment();
  }

  // Load avatar
  try {
    await loadVRMAvatar(currentAvatarPath);
    log("👤 Avatar loaded");
  } catch (e) {
    log(`❌ Avatar error: ${e.message}`);
  }

  // Mark active avatar
  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  // Init music
  initMusic();
  updateMusicUI();

  // Load history
  const hasHistory = loadHistory();
  setStatus(hasHistory ? "Welcome back! 😊" : "Ready to chat! 💭");

  // Load voices
  if (window.speechSynthesis) {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      log(`🔊 ${voices.length} voices`);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Mic permission
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    log("✅ Mic ready");
  } catch (e) {
    log("❌ Mic denied");
  }

  log("✅ Ready!");
  
  // Welcome
  setTimeout(() => {
    speak("Hey! I'm Luna, your conversation buddy. How's your day going?");
  }, 1200);
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
  if (isListening) stopListening();
});