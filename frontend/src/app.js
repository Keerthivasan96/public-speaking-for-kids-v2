// ============================================
// app.js - COMPLETE VERSION
// Room loads by default, all features included
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

// Backend API URL
const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

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

// Avatar state
let currentAvatarPath = "/assets/vrmavatar1.vrm";

// Music state
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

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
  console.log(`[App] ${message}`);
  
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
      log(`📂 Loaded ${conversationHistory.length} messages from history`);
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
    log("🗑️ Conversation history cleared");
  } catch (err) {
    console.error("Failed to clear history:", err);
  }
}

function saveAvatarChoice(path) {
  try {
    localStorage.setItem(AVATAR_KEY, path);
  } catch (err) {
    console.error("Failed to save avatar choice:", err);
  }
}

function loadAvatarChoice() {
  try {
    return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm";
  } catch (err) {
    return "/assets/vrmavatar1.vrm";
  }
}

function saveMusicState(playing) {
  try {
    localStorage.setItem(MUSIC_KEY, playing ? "on" : "off");
  } catch (err) {}
}

function loadMusicState() {
  try {
    return localStorage.getItem(MUSIC_KEY) === "on";
  } catch (err) {
    return false;
  }
}

function saveMusicVolume(volume) {
  try {
    localStorage.setItem(VOLUME_KEY, volume.toString());
  } catch (err) {}
}

function loadMusicVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved ? parseFloat(saved) : 0.3;
  } catch (err) {
    return 0.3;
  }
}

// ============================================
// MUSIC PLAYER
// ============================================
function initMusic() {
  log("🎵 Initializing music system...");
  
  // Create audio element
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  
  // Load saved volume
  musicVolume = loadMusicVolume();
  backgroundMusic.volume = musicVolume;
  
  // Try multiple music file paths
  const musicFiles = [
    "/assets/music/ambient.mp3",
    "/assets/music/ambient1.mp3",
    "/assets/music/ambient2.mp3",
    "/assets/music/background.mp3",
    "/assets/music/lofi.mp3",
    "/assets/music/music.mp3"
  ];
  
  let currentFileIndex = 0;
  
  function tryNextMusicFile() {
    if (currentFileIndex >= musicFiles.length) {
      log("🎵 No music files found in /assets/music/");
      return;
    }
    
    const filePath = musicFiles[currentFileIndex];
    log(`🎵 Trying: ${filePath}`);
    backgroundMusic.src = filePath;
    currentFileIndex++;
  }
  
  backgroundMusic.addEventListener("error", () => {
    tryNextMusicFile();
  });
  
  backgroundMusic.addEventListener("canplaythrough", () => {
    log("🎵 Music file loaded and ready!");
  });
  
  // Start trying to load music
  tryNextMusicFile();
  
  // Update volume slider if exists
  if (musicVolumeSlider) {
    musicVolumeSlider.value = musicVolume * 100;
  }
}

function playMusic() {
  if (!backgroundMusic || !backgroundMusic.src) {
    log("🎵 No music source available");
    return;
  }
  
  backgroundMusic.play()
    .then(() => {
      isMusicPlaying = true;
      saveMusicState(true);
      updateMusicToggleUI();
      log("🎵 Music playing");
    })
    .catch(err => {
      log("🎵 Playback blocked: " + err.message);
      // Will work after user interaction
    });
}

function pauseMusic() {
  if (!backgroundMusic) return;
  
  backgroundMusic.pause();
  isMusicPlaying = false;
  saveMusicState(false);
  updateMusicToggleUI();
  log("🔇 Music paused");
}

function toggleMusic() {
  if (isMusicPlaying) {
    pauseMusic();
  } else {
    playMusic();
  }
}

function setMusicVolume(volume) {
  musicVolume = Math.max(0, Math.min(1, volume));
  if (backgroundMusic) {
    backgroundMusic.volume = musicVolume;
  }
  saveMusicVolume(musicVolume);
}

function updateMusicToggleUI() {
  if (!musicToggle) return;
  
  if (isMusicPlaying) {
    musicToggle.classList.add("active");
  } else {
    musicToggle.classList.remove("active");
  }
  
  const label = musicToggle.querySelector(".mode-label");
  if (label) {
    label.textContent = isMusicPlaying ? "Music On 🎵" : "Music Off";
  }
}

// Lower music volume during speech
function lowerMusicForSpeech() {
  if (backgroundMusic && isMusicPlaying) {
    backgroundMusic.volume = musicVolume * 0.2;
  }
}

// Restore music volume after speech
function restoreMusicVolume() {
  if (backgroundMusic && isMusicPlaying) {
    backgroundMusic.volume = musicVolume;
  }
}

// ============================================
// CAPTION DISPLAY
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
// CORRECTION DISPLAY (Practice Mode)
// ============================================
function showCorrection(userText, correctedText, explanation, correctness) {
  if (!correctionContent || !correctionDisplay) return;

  let statusClass = "";
  let statusIcon = "";
  let statusText = "";
  
  switch (correctness) {
    case "correct":
      statusClass = "correction-correct";
      statusIcon = "✔️";
      statusText = "Perfect!";
      break;
    case "almost":
      statusClass = "correction-almost";
      statusIcon = "⚠️";
      statusText = "Almost there!";
      break;
    default:
      statusClass = "correction-wrong";
      statusIcon = "❌";
      statusText = "Let's improve";
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
            <div class="correction-display-label">Better way:</div>
            <div class="correction-display-text correction-green">"${escapeHtml(correctedText)}"</div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            💡 ${escapeHtml(explanation)}
          </div>
        ` : `
          <div style="text-align: center; color: #4caf50; font-weight: 600; margin-top: 8px;">
            Great job! Keep it up! 🎉
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
// STATUS DISPLAY
// ============================================
function setStatus(message, type = "") {
  if (!statusEl) return;

  const statusMessages = {
    ready: "Ready to chat! 💭",
    listening: "Listening... 👂",
    thinking: "Thinking... 💭",
    speaking: "Speaking... 💬",
    error: "Oops! Something went wrong 😅",
    paused: "Paused 💭",
    welcome: "Welcome back! 😊",
    fresh: "Fresh start! 🌟"
  };

  statusEl.textContent = statusMessages[type] || message;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function cleanMarkdown(text) {
  if (!text) return "";
  
  // Use marked if available
  if (typeof marked !== "undefined" && marked.parse) {
    const html = marked.parse(text);
    // Sanitize with DOMPurify if available
    const safe = (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) 
      ? DOMPurify.sanitize(html) 
      : html;
    // Extract text content
    const div = document.createElement("div");
    div.innerHTML = safe;
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }
  
  // Fallback: strip markdown characters
  return text
    .replace(/[*_~`#\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================
// PROMPT BUILDER
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English learning companion (age 16-17, warm and supportive).

TASK: Analyze this sentence for grammar and spelling errors.

Student said: "${userText}"

Respond in this EXACT JSON format (no markdown, no code blocks):
{
  "correctness": "correct" OR "almost" OR "wrong",
  "corrected": "the corrected sentence here",
  "explanation": "brief explanation of the error (under 20 words)",
  "reply": "an encouraging response to the student (1-2 sentences)"
}

Rules:
- If the sentence is perfect: correctness="correct"
- If there are minor errors (1-2 small mistakes): correctness="almost"
- If there are major errors: correctness="wrong"
- Always be encouraging and supportive
- Keep explanation brief and clear`;
  }
  
  // Casual conversation mode
  const personality = `You're a friendly 16-17 year old English companion. You're warm, supportive, and genuinely interested in the student.

Your personality:
- Cheerful and encouraging
- Natural and conversational (not robotic)
- Show genuine interest with follow-up questions sometimes
- Age-appropriate for 13-15 year old students
- No catchphrases or repetitive patterns
- Mix short and slightly longer responses naturally`;

  // Build conversation context
  const recentHistory = conversationHistory.slice(-15).map(msg => 
    `${msg.role === "user" ? "Student" : "You"}: ${msg.content}`
  ).join("\n");

  return `${personality}

${recentHistory ? `Recent conversation:\n${recentHistory}\n` : "(This is the start of the conversation)"}

Student: "${userText}"

Respond naturally in 1-3 sentences (about 30-60 words). Be warm and engaging!`;
}

// ============================================
// VOICE SELECTION
// ============================================
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Preferred voices in order
  const preferredVoices = [
    "Google US English Female",
    "Google UK English Female",
    "Microsoft Zira",
    "Samantha",
    "Karen",
    "Victoria",
    "Fiona"
  ];

  // Try to find preferred voice
  for (const name of preferredVoices) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }

  // Look for any female English voice
  const femaleVoice = voices.find(v => 
    (v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) &&
    /female|woman|girl/i.test(v.name)
  );
  if (femaleVoice) return femaleVoice;

  // Any English voice
  const englishVoice = voices.find(v => v.lang.startsWith("en"));
  return englishVoice || voices[0];
}

// ============================================
// TEXT-TO-SPEECH
// ============================================
function speak(text) {
  if (!text || !text.trim()) return;

  // Stop any current speech
  stopSpeech();

  // Clean the text
  const cleanText = cleanMarkdown(text);
  lastSpokenText = cleanText;

  // Create utterance
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  
  // Adjust rate and pitch for device
  if (IS_MOBILE) {
    utterance.rate = IS_ANDROID ? 0.85 : 0.88;
    utterance.pitch = IS_ANDROID ? 1.12 : 1.15;
  } else {
    utterance.rate = 0.95;
    utterance.pitch = 1.2;
  }

  // Set voice
  const voice = selectBestVoice();
  if (voice) utterance.voice = voice;

  // Event handlers
  utterance.onstart = () => {
    isSpeaking = true;
    avatarStartTalking();
    showCaptionText(cleanText);
    setStatus("Speaking... 💬", "speaking");
    lowerMusicForSpeech();
  };

  utterance.onend = () => {
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    restoreMusicVolume();

    if (isContinuousMode) {
      const delay = IS_MOBILE ? 1200 : 800;
      setTimeout(startNextListeningCycle, delay);
    } else {
      setStatus("Your turn! 💭", "ready");
    }
  };

  utterance.onerror = (event) => {
    console.error("Speech error:", event);
    isSpeaking = false;
    avatarStopTalking();
    hideCaptionText();
    restoreMusicVolume();
    
    if (isContinuousMode) {
      setTimeout(startNextListeningCycle, 1500);
    }
  };

  // Cancel any existing speech and speak
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}

  // Mobile needs a slight delay
  if (IS_MOBILE) {
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 150);
  } else {
    window.speechSynthesis.speak(utterance);
  }
}

function stopSpeech() {
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
  
  isSpeaking = false;
  avatarStopTalking();
  hideCaptionText();
  restoreMusicVolume();
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;

  setStatus("Listening... 👂", "listening");
  isListening = true;
  speechBuffer = "";
  
  startListening(handleUserSpeech, {
    continuous: false,
    lang: "en-IN",
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
    return;
  }

  // Use buffered text or final text
  const finalText = speechBuffer || text;
  speechBuffer = "";
  
  // Send to backend
  sendToBackend(finalText);
}

// ============================================
// BACKEND API
// ============================================
async function sendToBackend(text) {
  if (!text || !text.trim()) return;

  // Add to history
  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();

  setStatus("Thinking... 💭", "thinking");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: isPracticeMode ? 0.3 : 0.5,
        max_tokens: isPracticeMode ? 200 : 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || "I'm here to help! Could you say that again?";

    if (isPracticeMode) {
      handlePracticeModeResponse(text, reply);
    } else {
      handleCasualModeResponse(reply);
    }
  } catch (err) {
    console.error("Backend error:", err);
    log("❌ Backend error: " + err.message);
    setStatus("Oops! 😅", "error");
    speak("Sorry, I lost connection for a moment. Can you try again?");
  }
}

function handlePracticeModeResponse(userText, reply) {
  try {
    // Clean JSON from markdown code blocks
    const cleanedReply = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanedReply);

    // Add to history
    conversationHistory.push({ role: "assistant", content: parsed.reply });
    saveConversationHistory();

    // Show correction
    showCorrection(
      userText, 
      parsed.corrected || userText, 
      parsed.explanation || "", 
      parsed.correctness || "wrong"
    );

    // Speak the reply
    speak(parsed.reply);
  } catch (parseError) {
    console.error("Failed to parse practice mode response:", parseError);
    // Fallback: just speak the raw reply
    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();
    speak(cleanMarkdown(reply));
  }
}

function handleCasualModeResponse(reply) {
  conversationHistory.push({ role: "assistant", content: reply });
  saveConversationHistory();
  speak(cleanMarkdown(reply));
}

// ============================================
// AVATAR SWITCHING
// ============================================
async function switchAvatar(avatarPath) {
  log(`🔄 Switching avatar to: ${avatarPath}`);
  currentAvatarPath = avatarPath;
  saveAvatarChoice(avatarPath);
  
  try {
    await loadVRMAvatar(avatarPath);
    log("✅ Avatar loaded successfully!");
  } catch (err) {
    console.error("Failed to load avatar:", err);
    log("❌ Avatar load failed: " + err.message);
    
    // Try default avatar as fallback
    if (avatarPath !== "/assets/vrmavatar1.vrm") {
      log("🔄 Trying default avatar...");
      try {
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
        saveAvatarChoice(currentAvatarPath);
      } catch (fallbackErr) {
        log("❌ Default avatar also failed");
      }
    }
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Menu toggle
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    menuPanel?.classList.add("active");
    menuOverlay?.classList.add("active");
  });
}

if (menuClose) {
  menuClose.addEventListener("click", () => {
    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener("click", () => {
    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
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
    log(isPracticeMode ? "📝 Switched to Practice Mode" : "💬 Switched to Casual Chat");
  });
}

// Music toggle
if (musicToggle) {
  musicToggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMusic();
  });
}

// Music volume slider
if (musicVolumeSlider) {
  musicVolumeSlider.addEventListener("input", (e) => {
    setMusicVolume(e.target.value / 100);
  });
}

// Microphone button
if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (isContinuousMode) {
      // Stop listening
      isContinuousMode = false;
      stopListening();
      stopSpeech();
      isListening = false;

      micBtn.classList.remove("active");
      micBtn.textContent = "🎤";
      setStatus("Paused 💭", "paused");
      log("⏸️ Conversation paused");
    } else {
      // Start listening
      isContinuousMode = true;
      micBtn.classList.add("active");
      micBtn.textContent = "⏸️";
      setStatus("Listening... 👂", "listening");
      log("▶️ Conversation started");
      startNextListeningCycle();
    }
  });
}

// Clear conversation button
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (!confirm("Start a fresh conversation? This will clear your chat history.")) {
      return;
    }

    clearConversationStorage();
    stopSpeech();
    hideCaptionText();
    hideCorrection();

    setStatus("Fresh start! 🌟", "fresh");
    log("🔄 Started fresh conversation");

    // Close menu
    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
  });
}

// Demo lesson / Daily challenge button
if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", () => {
    const challenges = [
      "Tell me about something that made you smile today!",
      "What's your favorite hobby and why do you enjoy it?",
      "If you could learn any skill instantly, what would it be?",
      "Tell me about a friend who's important to you.",
      "What's your favorite movie or TV show right now?",
      "Describe your perfect weekend!",
      "What's something new you learned recently?",
      "If you could travel anywhere, where would you go?",
    ];

    const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
    log(`✨ Daily Challenge: "${randomChallenge}"`);
    speak(randomChallenge);

    // Close menu
    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
  });
}

// Avatar selection
avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    // Update UI
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    // Load new avatar
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
  log("🚀 Initializing application...");

  // Load saved avatar choice
  currentAvatarPath = loadAvatarChoice();
  log(`📦 Saved avatar: ${currentAvatarPath}`);

  // Initialize 3D scene
  const sceneReady = init3DScene("canvas-container");
  if (!sceneReady) {
    log("❌ Failed to initialize 3D scene!");
    return;
  }

  // Try to load room first (default environment)
  try {
    log("🏠 Loading room environment...");
    await loadRoomModel("/assets/room/room.glb");
    log("🏠 Room loaded successfully!");
  } catch (err) {
    log("🏠 Room not found - using fallback sky/ground");
    useFallbackEnvironment();
  }

  // Load VRM avatar
  try {
    log(`👤 Loading avatar: ${currentAvatarPath}`);
    await loadVRMAvatar(currentAvatarPath);
    log("👤 Avatar loaded successfully!");
  } catch (err) {
    log(`❌ Failed to load avatar: ${err.message}`);
    
    // Try default avatar
    if (currentAvatarPath !== "/assets/vrmavatar1.vrm") {
      try {
        log("👤 Trying default avatar...");
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
      } catch (fallbackErr) {
        log("❌ Default avatar also failed!");
      }
    }
  }

  // Mark active avatar in UI
  avatarOptions.forEach(btn => {
    if (btn.dataset.avatar === currentAvatarPath) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Initialize music
  initMusic();
  updateMusicToggleUI();

  // Load conversation history
  const hasHistory = loadConversationHistory();
  if (hasHistory) {
    setStatus("Welcome back! 😊", "welcome");
  } else {
    setStatus("Ready to chat! 💭", "ready");
  }

  // Load speech synthesis voices
  if (window.speechSynthesis) {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      log(`🔊 Loaded ${voices.length} voices`);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Request microphone permission on mobile
  if (IS_MOBILE && navigator.mediaDevices?.getUserMedia) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      log("✅ Microphone permission granted");
    } catch (err) {
      log("❌ Microphone permission denied");
      alert("Please allow microphone access to use voice features.");
    }
  }

  log("✅ Application ready!");
}

// ============================================
// START APPLICATION
// ============================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// ============================================
// CLEANUP HANDLERS
// ============================================
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) {
    stopSpeech();
  }
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (isListening) {
    stopListening();
  }
});