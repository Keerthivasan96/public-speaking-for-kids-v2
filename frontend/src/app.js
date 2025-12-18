// ============================================
// app.js - ROOM LOADS BY DEFAULT
// LOCATION: frontend/src/app.js
// ============================================

import { startListening, stopListening } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  removeRoom,
  hasRoom,
  setRoomMode
} from "./threejs-avatar-3d.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// Device detection
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

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
const roomToggle = document.getElementById("roomToggle");

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

// Avatar
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// Music
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// Room - DEFAULT ON
let isRoomEnabled = true;

// ============================================
// STORAGE
// ============================================
const STORAGE_KEY = "companion_history";
const AVATAR_KEY = "companion_avatar";
const MUSIC_KEY = "companion_music";
const VOLUME_KEY = "companion_volume";
const MAX_HISTORY = 200;

// ============================================
// LOGGING
// ============================================
function log(msg) {
  console.log("[App]", msg);
  if (logEl) {
    const time = new Date().toLocaleTimeString();
    logEl.innerHTML += `<span style="color:#999">[${time}]</span> ${msg}<br>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ============================================
// STORAGE FUNCTIONS
// ============================================
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-MAX_HISTORY)));
  } catch (e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      return true;
    }
  } catch (e) {}
  return false;
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  conversationHistory = [];
}

function saveAvatarChoice(path) {
  localStorage.setItem(AVATAR_KEY, path);
}

function loadAvatarChoice() {
  return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm";
}

// ============================================
// MUSIC PLAYER
// ============================================
function initMusic() {
  log("🎵 Initializing music...");
  
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  
  const savedVolume = localStorage.getItem(VOLUME_KEY);
  if (savedVolume) musicVolume = parseFloat(savedVolume);
  backgroundMusic.volume = musicVolume;
  
  const musicFiles = [
    "/assets/music/ambient.mp3",
    "/assets/music/ambient1.mp3",
    "/assets/music/ambient2.mp3",
    "/assets/music/background.mp3",
    "/assets/music/lofi.mp3"
  ];
  
  let currentFileIndex = 0;
  
  function tryLoadMusic() {
    if (currentFileIndex >= musicFiles.length) {
      log("🎵 No music files found");
      return;
    }
    backgroundMusic.src = musicFiles[currentFileIndex];
    currentFileIndex++;
  }
  
  backgroundMusic.addEventListener("error", tryLoadMusic);
  backgroundMusic.addEventListener("canplaythrough", () => log("🎵 Music ready"));
  
  tryLoadMusic();
  
  if (musicVolumeSlider) {
    musicVolumeSlider.value = musicVolume * 100;
  }
}

function playMusic() {
  if (!backgroundMusic?.src) return;
  
  backgroundMusic.play()
    .then(() => {
      isMusicPlaying = true;
      localStorage.setItem(MUSIC_KEY, "on");
      updateMusicUI();
      log("🎵 Playing");
    })
    .catch(err => log("🎵 Blocked: " + err.message));
}

function pauseMusic() {
  if (!backgroundMusic) return;
  backgroundMusic.pause();
  isMusicPlaying = false;
  localStorage.setItem(MUSIC_KEY, "off");
  updateMusicUI();
}

function toggleMusic() {
  if (isMusicPlaying) pauseMusic();
  else playMusic();
}

function updateMusicUI() {
  if (musicToggle) {
    musicToggle.classList.toggle("active", isMusicPlaying);
    const label = musicToggle.querySelector(".mode-label");
    if (label) label.textContent = isMusicPlaying ? "Music On 🎵" : "Music Off";
  }
}

// ============================================
// ROOM TOGGLE
// ============================================
async function toggleRoom() {
  if (isRoomEnabled) {
    removeRoom();
    isRoomEnabled = false;
    updateRoomUI();
    log("🏠 Room disabled");
  } else {
    try {
      await loadRoomModel("/assets/room/room.glb");
      isRoomEnabled = true;
      updateRoomUI();
      log("🏠 Room enabled");
    } catch (err) {
      log("🏠 Room failed: " + err.message);
    }
  }
}

function updateRoomUI() {
  if (roomToggle) {
    roomToggle.classList.toggle("active", isRoomEnabled);
    const label = roomToggle.querySelector(".mode-label");
    if (label) label.textContent = isRoomEnabled ? "Room On 🏠" : "Room Off";
  }
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
// CORRECTION
// ============================================
function showCorrection(userText, correctedText, explanation, correctness) {
  if (!correctionContent || !correctionDisplay) return;

  const statusClass = correctness === "correct" ? "correction-correct" : 
                      correctness === "almost" ? "correction-almost" : "correction-wrong";
  const statusIcon = correctness === "correct" ? "✔️" : 
                     correctness === "almost" ? "⚠️" : "❌";

  correctionContent.innerHTML = `
    <div class="${statusClass}">
      <div class="correction-display-header">
        <span>${statusIcon}</span>
        <span>${correctness === "correct" ? "Perfect!" : "Let's improve"}</span>
      </div>
      <div class="correction-display-content">
        <div class="correction-display-section">
          <div class="correction-display-label">You said:</div>
          <div>"${userText}"</div>
        </div>
        ${correctness !== "correct" ? `
          <div class="correction-display-section">
            <div class="correction-display-label">Better:</div>
            <div class="correction-green">"${correctedText}"</div>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#666;">${explanation}</div>
        ` : ""}
      </div>
    </div>
  `;
  correctionDisplay.style.display = "block";
}

function hideCorrection() {
  if (correctionDisplay) correctionDisplay.style.display = "none";
}

// ============================================
// STATUS
// ============================================
function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

// ============================================
// PROMPT
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English tutor. Analyze: "${userText}"
Respond in JSON only: {"correctness":"correct/almost/wrong","corrected":"...","explanation":"...","reply":"..."}`;
  }
  
  const history = conversationHistory.slice(-10).map(m => 
    `${m.role === "user" ? "Student" : "You"}: ${m.content}`
  ).join("\n");

  return `You're a friendly 16-17yo English companion. Be warm, natural.
${history ? `Recent:\n${history}\n` : ""}
Student: "${userText}"
Respond in 1-3 sentences.`;
}

// ============================================
// VOICE
// ============================================
function selectVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferred = ["Google US English Female", "Samantha", "Karen", "Victoria"];
  for (const name of preferred) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// TTS
// ============================================
function speak(text) {
  if (!text?.trim()) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text.replace(/[*_~`#\[\]]/g, "").trim());
  utter.lang = "en-US";
  utter.volume = 1.0;
  utter.rate = IS_MOBILE ? 0.88 : 0.95;
  utter.pitch = IS_MOBILE ? 1.12 : 1.22;

  const voice = selectVoice();
  if (voice) utter.voice = voice;

  utter.onstart = () => {
    isSpeaking = true;
    avatarStartTalking();
    showCaption(text);
    if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume * 0.2;
  };

  utter.onend = () => {
    isSpeaking = false;
    avatarStopTalking();
    hideCaption();
    if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume;
    if (isContinuousMode) setTimeout(startListeningCycle, IS_MOBILE ? 1200 : 800);
    else setStatus("Your turn! 💭");
  };

  utter.onerror = () => {
    isSpeaking = false;
    avatarStopTalking();
    hideCaption();
    if (backgroundMusic) backgroundMusic.volume = musicVolume;
    if (isContinuousMode) setTimeout(startListeningCycle, 1500);
  };

  if (IS_MOBILE) setTimeout(() => window.speechSynthesis.speak(utter), 150);
  else window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  avatarStopTalking();
  hideCaption();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;
  setStatus("Listening... 👂");
  isListening = true;
  speechBuffer = "";
  startListening(handleSpeech, { continuous: false, lang: "en-IN", interimResults: true });
}

function handleSpeech(text, isFinal = true) {
  if (!text?.trim()) {
    if (isContinuousMode && isFinal) setTimeout(startListeningCycle, 500);
    return;
  }
  if (!isFinal) { speechBuffer = text; return; }
  sendToBackend(speechBuffer || text);
  speechBuffer = "";
}

// ============================================
// BACKEND
// ============================================
async function sendToBackend(text) {
  if (!text?.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  setStatus("Thinking... 💭");

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

    if (!res.ok) throw new Error("API error");

    const data = await res.json();
    const reply = data.reply || "I'm here for you!";

    if (isPracticeMode) {
      try {
        const parsed = JSON.parse(reply.replace(/```json\n?|\n?```/g, "").trim());
        conversationHistory.push({ role: "assistant", content: parsed.reply });
        saveHistory();
        showCorrection(text, parsed.corrected, parsed.explanation, parsed.correctness);
        speak(parsed.reply);
      } catch { speak(reply); }
    } else {
      conversationHistory.push({ role: "assistant", content: reply });
      saveHistory();
      speak(reply);
    }
  } catch (err) {
    log("❌ Error: " + err.message);
    setStatus("Oops! 😅");
    speak("Sorry, connection issue. Try again?");
  }
}

// ============================================
// AVATAR SWITCH
// ============================================
async function switchAvatar(path) {
  log("🔄 Switching: " + path);
  currentAvatarPath = path;
  saveAvatarChoice(path);
  try {
    await loadVRMAvatar(path);
    log("✅ Avatar loaded");
  } catch (err) {
    log("❌ Failed: " + err.message);
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

// Practice mode
modeToggle?.addEventListener("click", () => {
  isPracticeMode = !isPracticeMode;
  modeToggle.classList.toggle("active", isPracticeMode);
  const label = modeToggle.querySelector(".mode-label");
  if (label) label.textContent = isPracticeMode ? "Practice Mode" : "Casual Chat";
  hideCorrection();
});

// Music
musicToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMusic();
});

musicVolumeSlider?.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
  localStorage.setItem(VOLUME_KEY, musicVolume.toString());
});

// Room
roomToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleRoom();
});

// Mic
micBtn?.addEventListener("click", () => {
  if (isContinuousMode) {
    isContinuousMode = false;
    stopListening();
    stopSpeech();
    isListening = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Paused 💭");
  } else {
    isContinuousMode = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    setStatus("Listening... 👂");
    startListeningCycle();
  }
});

// Clear
clearBtn?.addEventListener("click", () => {
  if (!confirm("Start fresh?")) return;
  clearHistory();
  stopSpeech();
  hideCaption();
  hideCorrection();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Demo
demoLessonBtn?.addEventListener("click", () => {
  const challenges = [
    "Tell me about something that made you smile today!",
    "What's your favorite hobby?",
    "Describe your perfect weekend!",
    "What anime are you watching lately?",
  ];
  speak(challenges[Math.floor(Math.random() * challenges.length)]);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Avatar selection
avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const path = btn.dataset.avatar;
    if (path) switchAvatar(path);
  });
});

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  log("🚀 Starting...");

  currentAvatarPath = loadAvatarChoice();

  // Init 3D scene
  const sceneReady = init3DScene("canvas-container");
  if (!sceneReady) {
    log("❌ Scene failed");
    return;
  }

  // LOAD ROOM FIRST (default environment)
  try {
    log("🏠 Loading room...");
    await loadRoomModel("/assets/room/room.glb");
    isRoomEnabled = true;
    log("🏠 Room loaded!");
  } catch (err) {
    log("🏠 Room not found, using fallback");
    isRoomEnabled = false;
  }
  updateRoomUI();

  // THEN LOAD AVATAR
  try {
    await loadVRMAvatar(currentAvatarPath);
    log("✅ Avatar loaded");
  } catch {
    try {
      await loadVRMAvatar("/assets/vrmavatar1.vrm");
    } catch {
      log("❌ Avatar failed");
    }
  }

  // Mark active avatar
  avatarOptions.forEach(btn => {
    if (btn.dataset.avatar === currentAvatarPath) btn.classList.add("active");
  });

  // Music
  initMusic();
  updateMusicUI();

  // History
  if (loadHistory()) setStatus("Welcome back! 😊");
  else setStatus("Ready to chat! 💭");

  // Voices
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      log("🔊 Voices: " + window.speechSynthesis.getVoices().length);
    };
  }

  // Mic permission
  if (IS_MOBILE && navigator.mediaDevices?.getUserMedia) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      log("✅ Mic allowed");
    } catch {
      alert("Please allow microphone access.");
    }
  }

  log("✅ Ready!");
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Cleanup
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) stopSpeech();
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (isListening) stopListening();
});