// ============================================
// app.js - DEBUGGED LOW LATENCY VERSION
// With better logging and speech synthesis fixes
// ============================================

import { startListening, stopListening } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  useFallbackEnvironment,
  hasRoom,
  setExpression,
  setSkyColors
} from "./threejs-avatar-3d.js";

// ============================================
// API CONFIGURATION - UPDATE THESE!
// ============================================
const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";
const API_STREAM_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/stream";

// ============================================
// DEVICE DETECTION
// ============================================
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);

console.log(`📱 Device: ${IS_MOBILE ? 'Mobile' : 'Desktop'}, iOS: ${IS_IOS}, Android: ${IS_ANDROID}`);

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
// APPLICATION STATE
// ============================================
let isListening = false;
let isSpeaking = false;
let isContinuousMode = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;
let speechBuffer = "";

// Streaming state
let isStreaming = false;
let streamController = null;
let speechQueue = [];
let currentUtterance = null;
let fullResponseText = "";

// Avatar state
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// Music state
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// ============================================
// STREAMING CONFIGURATION
// ============================================
const STREAM_CONFIG = {
  minCharsToSpeak: 15,
  sentenceBreaks: ['.', '!', '?', ',', ';', ':'],
  // Set to FALSE to use regular API (more stable)
  useStreaming: false,  // DISABLED for debugging
  speakBySentence: true,
};

// ============================================
// STORAGE KEYS
// ============================================
const STORAGE_KEY = "companion_conversation_history";
const AVATAR_KEY = "companion_selected_avatar";
const MUSIC_KEY = "companion_music_enabled";
const VOLUME_KEY = "companion_music_volume";
const MAX_HISTORY_ITEMS = 200;

// ============================================
// LOGGING UTILITY
// ============================================
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[App ${timestamp}] ${message}`);
  
  if (logEl) {
    logEl.innerHTML += `<span style="color:#999">[${timestamp}]</span> ${message}<br>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ============================================
// LOCAL STORAGE FUNCTIONS
// ============================================
function saveConversationHistory() {
  try {
    const historyToSave = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyToSave));
  } catch (err) {
    console.error("Failed to save history:", err);
  }
}

function loadConversationHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      log(`📂 Loaded ${conversationHistory.length} messages`);
      return true;
    }
  } catch (err) {
    console.error("Failed to load history:", err);
  }
  return false;
}

function clearConversationStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    conversationHistory = [];
    log("🗑️ History cleared");
  } catch (err) {
    console.error("Failed to clear:", err);
  }
}

function saveAvatarChoice(path) {
  try { localStorage.setItem(AVATAR_KEY, path); } catch (err) {}
}

function loadAvatarChoice() {
  try { return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm"; } 
  catch (err) { return "/assets/vrmavatar1.vrm"; }
}

function saveMusicState(playing) {
  try { localStorage.setItem(MUSIC_KEY, playing ? "on" : "off"); } catch (err) {}
}

function loadMusicState() {
  try { return localStorage.getItem(MUSIC_KEY) === "on"; } 
  catch (err) { return false; }
}

function saveMusicVolume(volume) {
  try { localStorage.setItem(VOLUME_KEY, volume.toString()); } catch (err) {}
}

function loadMusicVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved ? parseFloat(saved) : 0.3;
  } catch (err) { return 0.3; }
}

// ============================================
// MUSIC PLAYER
// ============================================
function initMusic() {
  log("🎵 Init music...");
  
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  
  musicVolume = loadMusicVolume();
  backgroundMusic.volume = musicVolume;
  
  const musicFiles = [
    "/assets/music/ambient.mp3",
    "/assets/music/ambient1.mp3",
    "/assets/music/background.mp3",
  ];
  
  let idx = 0;
  function tryNext() {
    if (idx >= musicFiles.length) { log("🎵 No music found"); return; }
    backgroundMusic.src = musicFiles[idx++];
  }
  
  backgroundMusic.addEventListener("error", tryNext);
  backgroundMusic.addEventListener("canplaythrough", () => log("🎵 Music ready!"));
  tryNext();
  
  if (musicVolumeSlider) musicVolumeSlider.value = musicVolume * 100;
}

function playMusic() {
  if (!backgroundMusic?.src) return;
  backgroundMusic.play()
    .then(() => { isMusicPlaying = true; saveMusicState(true); updateMusicToggleUI(); })
    .catch(err => log("🎵 Blocked: " + err.message));
}

function pauseMusic() {
  if (!backgroundMusic) return;
  backgroundMusic.pause();
  isMusicPlaying = false;
  saveMusicState(false);
  updateMusicToggleUI();
}

function toggleMusic() { isMusicPlaying ? pauseMusic() : playMusic(); }

function setMusicVolume(volume) {
  musicVolume = Math.max(0, Math.min(1, volume));
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
  saveMusicVolume(musicVolume);
}

function updateMusicToggleUI() {
  if (!musicToggle) return;
  musicToggle.classList.toggle("active", isMusicPlaying);
  const label = musicToggle.querySelector(".mode-label");
  if (label) label.textContent = isMusicPlaying ? "Music On 🎵" : "Music Off";
}

function lowerMusicForSpeech() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume * 0.15;
}

function restoreMusicVolume() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume;
}

// ============================================
// CAPTION DISPLAY
// ============================================
function showCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
}

function updateCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
}

function hideCaptionText() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
}

// ============================================
// CORRECTION DISPLAY
// ============================================
function showCorrection(userText, correctedText, explanation, correctness) {
  if (!correctionContent || !correctionDisplay) return;
  
  let statusClass = "correction-wrong";
  let statusIcon = "❌";
  let statusText = "Let's improve";
  
  if (correctness === "correct") {
    statusClass = "correction-correct"; statusIcon = "✔️"; statusText = "Perfect!";
  } else if (correctness === "almost") {
    statusClass = "correction-almost"; statusIcon = "⚠️"; statusText = "Almost!";
  }

  correctionContent.innerHTML = `
    <div class="${statusClass}">
      <div style="font-weight:bold;margin-bottom:8px">${statusIcon} ${statusText}</div>
      <div style="margin-bottom:4px"><b>You said:</b> "${escapeHtml(userText)}"</div>
      ${correctness !== "correct" ? `
        <div style="margin-bottom:4px;color:#4caf50"><b>Better:</b> "${escapeHtml(correctedText)}"</div>
        <div style="font-size:12px;color:#666">💡 ${escapeHtml(explanation)}</div>
      ` : `<div style="color:#4caf50">Great job! 🎉</div>`}
    </div>
  `;
  correctionDisplay.style.display = "block";
}

function hideCorrection() {
  if (correctionDisplay) correctionDisplay.style.display = "none";
}

// ============================================
// STATUS DISPLAY
// ============================================
function setStatus(message, type = "") {
  if (!statusEl) return;
  const messages = {
    ready: "Ready to chat! 💭",
    listening: "Listening... 👂",
    thinking: "Thinking... 💭",
    speaking: "Speaking... 💬",
    streaming: "Responding... ✨",
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

function cleanMarkdown(text) {
  if (!text) return "";
  return text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
}

// ============================================
// PROMPT BUILDER
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English learning companion.
TASK: Analyze this sentence for grammar errors.
Student said: "${userText}"
Respond in JSON: {"correctness":"correct/almost/wrong","corrected":"...","explanation":"...","reply":"..."}`;
  }
  
  const recentHistory = conversationHistory.slice(-6).map(msg => 
    `${msg.role === "user" ? "Student" : "You"}: ${msg.content}`
  ).join("\n");

  return `You're a friendly 16-17 year old English companion. Be warm and concise (1-2 sentences, under 40 words).

${recentHistory ? `Recent:\n${recentHistory}\n` : ""}
Student: "${userText}"

Respond naturally:`;
}

// ============================================
// VOICE SELECTION
// ============================================
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferred = ["Google US English", "Samantha", "Karen", "Victoria", "Zira"];
  for (const name of preferred) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// TEXT-TO-SPEECH - SIMPLE VERSION
// ============================================
function speak(text) {
  if (!text || !text.trim()) {
    log("⚠️ Empty text, not speaking");
    return;
  }

  log(`🔊 Speaking: "${text.substring(0, 50)}..."`);
  
  // Cancel any current speech
  try { window.speechSynthesis.cancel(); } catch (e) {}
  
  const cleanText = cleanMarkdown(text);
  lastSpokenText = cleanText;
  
  // Show caption
  showCaptionText(cleanText);
  setStatus("Speaking... 💬", "speaking");
  
  // Create utterance
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = IS_MOBILE ? 0.9 : 0.95;
  utterance.pitch = IS_MOBILE ? 1.1 : 1.15;
  
  // Set voice
  const voice = selectBestVoice();
  if (voice) {
    utterance.voice = voice;
    log(`🔊 Using voice: ${voice.name}`);
  }

  utterance.onstart = () => {
    log("🔊 Speech started");
    isSpeaking = true;
    avatarStartTalking();
    lowerMusicForSpeech();
  };

  utterance.onend = () => {
    log("🔊 Speech ended");
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    restoreMusicVolume();
    
    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, IS_MOBILE ? 1000 : 600);
    } else {
      setStatus("Your turn! 💭", "ready");
    }
  };

  utterance.onerror = (e) => {
    log(`❌ Speech error: ${e.error}`);
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    restoreMusicVolume();
    
    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, 1500);
    }
  };

  // Speak with small delay (helps on mobile)
  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 100);
}

function stopSpeech() {
  try { window.speechSynthesis.cancel(); } catch (e) {}
  isSpeaking = false;
  avatarStopTalking();
  hideCaptionText();
  restoreMusicVolume();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking || isStreaming) return;

  setStatus("Listening... 👂", "listening");
  isListening = true;
  speechBuffer = "";
  
  startListening(handleUserSpeech, {
    continuous: false,
    lang: "en-US",
    interimResults: true
  });
}

function handleUserSpeech(text, isFinal = true) {
  log(`🎤 Heard: "${text}" (final: ${isFinal})`);
  
  if (!text || !text.trim()) {
    if (isContinuousMode && isFinal) {
      setTimeout(startNextListeningCycle, 500);
    }
    return;
  }

  if (!isFinal) {
    speechBuffer = text;
    showCaptionText(`You: ${text}...`);
    return;
  }

  const finalText = speechBuffer || text;
  speechBuffer = "";
  hideCaptionText();
  
  sendToBackend(finalText);
}

// ============================================
// BACKEND API - MAIN ENTRY POINT
// ============================================
async function sendToBackend(text) {
  if (!text || !text.trim()) return;

  log(`📤 Sending to backend: "${text}"`);

  // Stop any ongoing speech/stream
  stopSpeech();
  if (streamController) {
    streamController.abort();
    streamController = null;
  }

  // Add to history
  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();

  setStatus("Thinking... 💭", "thinking");

  // Use streaming or regular API
  if (STREAM_CONFIG.useStreaming && !isPracticeMode) {
    await streamFromBackend(text);
  } else {
    await fetchFromBackend(text);
  }
}

// ============================================
// NON-STREAMING API CALL (MORE STABLE)
// ============================================
async function fetchFromBackend(text) {
  log(`📡 Fetching from: ${API_URL}`);

  try {
    const prompt = buildPrompt(text);
    log(`📝 Prompt length: ${prompt.length} chars`);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt,
        temperature: isPracticeMode ? 0.3 : 0.7,
        max_tokens: isPracticeMode ? 200 : 100,
      }),
    });

    log(`📥 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      log(`❌ API Error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    log(`📥 Response data: ${JSON.stringify(data).substring(0, 100)}...`);

    const reply = data.reply || data.text || data.content || "Sorry, I didn't understand.";

    if (isPracticeMode) {
      handlePracticeModeResponse(text, reply);
    } else {
      handleCasualModeResponse(reply);
    }

  } catch (err) {
    console.error("Backend error:", err);
    log(`❌ Backend error: ${err.message}`);
    setStatus("Oops! 😅", "error");
    speak("Sorry, I had trouble connecting. Can you try again?");
  }
}

// ============================================
// STREAMING API CALL
// ============================================
async function streamFromBackend(text) {
  log(`📡 Streaming from: ${API_STREAM_URL}`);
  
  setStatus("Responding... ✨", "streaming");
  isStreaming = true;
  fullResponseText = "";

  streamController = new AbortController();

  try {
    const response = await fetch(API_STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.7,
        max_tokens: 100,
      }),
      signal: streamController.signal
    });

    log(`📥 Stream response status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.token || '';
            
            if (token) {
              fullResponseText += token;
              updateCaptionText(fullResponseText);
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }
    }

    log(`📥 Stream complete: "${fullResponseText.substring(0, 50)}..."`);

    if (fullResponseText.trim()) {
      conversationHistory.push({ role: "assistant", content: fullResponseText });
      saveConversationHistory();
      speak(fullResponseText);
    } else {
      log("⚠️ Empty stream response");
      speak("Sorry, I didn't get a response. Can you try again?");
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      log("⏹️ Stream aborted");
    } else {
      log(`❌ Stream error: ${err.message}`);
      // Fallback to non-streaming
      log("🔄 Falling back to non-streaming...");
      await fetchFromBackend(text);
    }
  } finally {
    isStreaming = false;
    streamController = null;
  }
}

// ============================================
// RESPONSE HANDLERS
// ============================================
function handlePracticeModeResponse(userText, reply) {
  log(`📝 Practice mode response: ${reply.substring(0, 100)}`);
  
  try {
    const cleanedReply = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanedReply);

    conversationHistory.push({ role: "assistant", content: parsed.reply || reply });
    saveConversationHistory();

    showCorrection(
      userText, 
      parsed.corrected || userText, 
      parsed.explanation || "", 
      parsed.correctness || "wrong"
    );

    speak(parsed.reply || "Good try! Keep practicing.");
  } catch (parseError) {
    log("⚠️ JSON parse failed, using raw reply");
    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();
    speak(cleanMarkdown(reply));
  }
}

function handleCasualModeResponse(reply) {
  log(`💬 Casual response: ${reply.substring(0, 100)}`);
  
  conversationHistory.push({ role: "assistant", content: reply });
  saveConversationHistory();
  speak(cleanMarkdown(reply));
}

// ============================================
// AVATAR SWITCHING
// ============================================
async function switchAvatar(avatarPath) {
  log(`🔄 Switching avatar: ${avatarPath}`);
  currentAvatarPath = avatarPath;
  saveAvatarChoice(avatarPath);
  
  try {
    await loadVRMAvatar(avatarPath);
    log("✅ Avatar loaded!");
  } catch (err) {
    log(`❌ Avatar failed: ${err.message}`);
    if (avatarPath !== "/assets/vrmavatar1.vrm") {
      try {
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
        saveAvatarChoice(currentAvatarPath);
      } catch (e) {}
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
  if (label) label.textContent = isPracticeMode ? "Practice Mode" : "Casual Chat";
  hideCorrection();
  log(isPracticeMode ? "📝 Practice Mode" : "💬 Casual Chat");
});

// Music
musicToggle?.addEventListener("click", (e) => { e.preventDefault(); toggleMusic(); });
musicVolumeSlider?.addEventListener("input", (e) => setMusicVolume(e.target.value / 100));

// Microphone button
micBtn?.addEventListener("click", () => {
  if (isContinuousMode) {
    // Stop
    isContinuousMode = false;
    stopListening();
    stopSpeech();
    streamController?.abort();
    isListening = false;
    isStreaming = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Paused 💭", "ready");
    log("⏸️ Stopped");
  } else {
    // Start
    isContinuousMode = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    setStatus("Listening... 👂", "listening");
    log("▶️ Started");
    startNextListeningCycle();
  }
});

// Clear conversation
clearBtn?.addEventListener("click", () => {
  if (!confirm("Start fresh?")) return;
  clearConversationStorage();
  stopSpeech();
  hideCaptionText();
  hideCorrection();
  setStatus("Fresh start! 🌟", "ready");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Demo lesson
demoLessonBtn?.addEventListener("click", () => {
  const challenges = [
    "Tell me about something fun you did recently!",
    "What's your favorite thing to do on weekends?",
    "If you could learn any skill, what would it be?",
    "Describe your perfect day!",
  ];
  const challenge = challenges[Math.floor(Math.random() * challenges.length)];
  log(`✨ Challenge: "${challenge}"`);
  speak(challenge);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

// Avatar selection
avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const avatarPath = btn.dataset.avatar;
    if (avatarPath && avatarPath !== currentAvatarPath) {
      switchAvatar(avatarPath);
    }
  });
});

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  log("🚀 Initializing...");
  log(`📡 API URL: ${API_URL}`);
  log(`📡 Stream URL: ${API_STREAM_URL}`);
  log(`🔄 Streaming enabled: ${STREAM_CONFIG.useStreaming}`);

  currentAvatarPath = loadAvatarChoice();

  const sceneReady = init3DScene("canvas-container");
  if (!sceneReady) {
    log("❌ 3D scene failed!");
    return;
  }

  // Load room
  try {
    await loadRoomModel("/assets/room/room1.glb");
    log("🏠 Room loaded!");
  } catch (err) {
    log("🏠 Using fallback environment");
    useFallbackEnvironment();
  }

  // Load avatar
  try {
    await loadVRMAvatar(currentAvatarPath);
    log("👤 Avatar loaded!");
  } catch (err) {
    log(`❌ Avatar failed: ${err.message}`);
    if (currentAvatarPath !== "/assets/vrmavatar1.vrm") {
      try {
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
      } catch (e) {}
    }
  }

  // Mark active avatar
  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  // Init music
  initMusic();
  updateMusicToggleUI();

  // Load history
  const hasHistory = loadConversationHistory();
  setStatus(hasHistory ? "Welcome back! 😊" : "Ready to chat! 💭", "ready");

  // Load voices
  if (window.speechSynthesis) {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      log(`🔊 ${voices.length} voices available`);
    };
    
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Request mic permission
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      log("✅ Mic permission granted");
    } catch (err) {
      log("❌ Mic permission denied");
    }
  }

  log("✅ Ready!");
  
  // Test speech synthesis
  log("🔊 Testing speech synthesis...");
  setTimeout(() => {
    speak("Hello! I'm ready to chat with you.");
  }, 1000);
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Cleanup
window.addEventListener("beforeunload", () => {
  stopSpeech();
  streamController?.abort();
  if (isListening) stopListening();
});