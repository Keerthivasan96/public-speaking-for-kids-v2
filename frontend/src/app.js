// ============================================
// app.js - LOW LATENCY STREAMING VERSION
// Streams LLM response + speaks in chunks
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
// API CONFIGURATION
// ============================================
// Streaming endpoint (you'll need to update your backend)
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
  // Minimum characters before speaking first chunk
  minCharsToSpeak: 15,
  // Characters to look for sentence breaks
  sentenceBreaks: ['.', '!', '?', ',', ';', ':'],
  // Use streaming (set to false to use regular API)
  useStreaming: true,
  // Speak as sentences complete (true) or word by word (false)
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
  
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  
  musicVolume = loadMusicVolume();
  backgroundMusic.volume = musicVolume;
  
  const musicFiles = [
    "/assets/music/ambient.mp3",
    "/assets/music/ambient1.mp3",
    "/assets/music/background.mp3",
    "/assets/music/lofi.mp3",
    "/assets/music/music.mp3"
  ];
  
  let currentFileIndex = 0;
  
  function tryNextMusicFile() {
    if (currentFileIndex >= musicFiles.length) {
      log("🎵 No music files found");
      return;
    }
    backgroundMusic.src = musicFiles[currentFileIndex];
    currentFileIndex++;
  }
  
  backgroundMusic.addEventListener("error", tryNextMusicFile);
  backgroundMusic.addEventListener("canplaythrough", () => {
    log("🎵 Music ready!");
  });
  
  tryNextMusicFile();
  
  if (musicVolumeSlider) {
    musicVolumeSlider.value = musicVolume * 100;
  }
}

function playMusic() {
  if (!backgroundMusic || !backgroundMusic.src) return;
  
  backgroundMusic.play()
    .then(() => {
      isMusicPlaying = true;
      saveMusicState(true);
      updateMusicToggleUI();
      log("🎵 Music playing");
    })
    .catch(err => log("🎵 Playback blocked: " + err.message));
}

function pauseMusic() {
  if (!backgroundMusic) return;
  backgroundMusic.pause();
  isMusicPlaying = false;
  saveMusicState(false);
  updateMusicToggleUI();
}

function toggleMusic() {
  isMusicPlaying ? pauseMusic() : playMusic();
}

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
  if (backgroundMusic && isMusicPlaying) {
    backgroundMusic.volume = musicVolume * 0.15;
  }
}

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

function updateCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
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

  correctionContent.innerHTML = `
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

  const statusMessages = {
    ready: "Ready to chat! 💭",
    listening: "Listening... 👂",
    thinking: "Thinking... 💭",
    speaking: "Speaking... 💬",
    streaming: "Responding... ✨",
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
  
  if (typeof marked !== "undefined" && marked.parse) {
    const html = marked.parse(text);
    const safe = (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) 
      ? DOMPurify.sanitize(html) 
      : html;
    const div = document.createElement("div");
    div.innerHTML = safe;
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }
  
  return text.replace(/[*_~`#\[\]]/g, "").replace(/\s+/g, " ").trim();
}

// ============================================
// PROMPT BUILDER
// ============================================
function buildPrompt(userText) {
  if (isPracticeMode) {
    return `You are a friendly English learning companion.

TASK: Analyze this sentence for grammar and spelling errors.

Student said: "${userText}"

Respond in this EXACT JSON format:
{
  "correctness": "correct" OR "almost" OR "wrong",
  "corrected": "the corrected sentence",
  "explanation": "brief explanation (under 15 words)",
  "reply": "encouraging response (1 sentence)"
}`;
  }
  
  const personality = `You're a friendly 16-17 year old English companion. Be warm, natural, and concise. No catchphrases.`;

  const recentHistory = conversationHistory.slice(-10).map(msg => 
    `${msg.role === "user" ? "Student" : "You"}: ${msg.content}`
  ).join("\n");

  return `${personality}

${recentHistory ? `Recent:\n${recentHistory}\n` : ""}
Student: "${userText}"

Respond naturally in 1-2 sentences (20-40 words max). Be warm!`;
}

// ============================================
// VOICE SELECTION
// ============================================
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const preferredVoices = [
    "Google US English Female",
    "Google UK English Female", 
    "Microsoft Zira",
    "Samantha",
    "Karen",
    "Victoria"
  ];

  for (const name of preferredVoices) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }

  const femaleVoice = voices.find(v => 
    (v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) &&
    /female|woman|girl/i.test(v.name)
  );
  if (femaleVoice) return femaleVoice;

  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// STREAMING TEXT-TO-SPEECH
// ============================================

// Queue system for speaking chunks
function speakChunk(text, isLast = false) {
  if (!text || !text.trim()) {
    if (isLast) finishSpeaking();
    return;
  }

  const cleanText = cleanMarkdown(text);
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = IS_MOBILE ? (IS_ANDROID ? 0.9 : 0.92) : 1.0;
  utterance.pitch = IS_MOBILE ? (IS_ANDROID ? 1.1 : 1.12) : 1.15;
  
  const voice = selectBestVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => {
    if (!isSpeaking) {
      isSpeaking = true;
      avatarStartTalking();
      lowerMusicForSpeech();
    }
  };

  utterance.onend = () => {
    // Process next chunk in queue
    if (speechQueue.length > 0) {
      const next = speechQueue.shift();
      speakChunk(next.text, next.isLast);
    } else if (isLast) {
      finishSpeaking();
    }
  };

  utterance.onerror = (e) => {
    console.error("Speech error:", e);
    if (speechQueue.length > 0) {
      const next = speechQueue.shift();
      speakChunk(next.text, next.isLast);
    } else {
      finishSpeaking();
    }
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function queueSpeechChunk(text, isLast = false) {
  if (!isSpeaking && speechQueue.length === 0) {
    // Start speaking immediately
    speakChunk(text, isLast);
  } else {
    // Queue for later
    speechQueue.push({ text, isLast });
  }
}

function finishSpeaking() {
  isSpeaking = false;
  avatarStopTalking();
  hideCaptionText();
  restoreMusicVolume();
  speechQueue = [];
  currentUtterance = null;

  if (isContinuousMode) {
    const delay = IS_MOBILE ? 800 : 500;
    setTimeout(startNextListeningCycle, delay);
  } else {
    setStatus("Your turn! 💭", "ready");
  }
}

// Non-streaming speak (legacy)
function speak(text) {
  if (!text || !text.trim()) return;
  stopSpeech();
  
  const cleanText = cleanMarkdown(text);
  lastSpokenText = cleanText;
  showCaptionText(cleanText);
  setStatus("Speaking... 💬", "speaking");
  
  queueSpeechChunk(cleanText, true);
}

function stopSpeech() {
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
  
  speechQueue = [];
  currentUtterance = null;
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
    // Show interim text in caption
    showCaptionText(`You: ${text}...`);
    return;
  }

  const finalText = speechBuffer || text;
  speechBuffer = "";
  hideCaptionText();
  
  sendToBackend(finalText);
}

// ============================================
// STREAMING BACKEND API
// ============================================
async function sendToBackend(text) {
  if (!text || !text.trim()) return;

  // Stop any ongoing stream
  if (streamController) {
    streamController.abort();
    streamController = null;
  }
  stopSpeech();

  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();

  if (STREAM_CONFIG.useStreaming && !isPracticeMode) {
    await streamFromBackend(text);
  } else {
    await fetchFromBackend(text);
  }
}

// ============================================
// STREAMING RESPONSE HANDLER
// ============================================
async function streamFromBackend(text) {
  setStatus("Responding... ✨", "streaming");
  isStreaming = true;
  fullResponseText = "";
  
  let sentenceBuffer = "";
  let hasStartedSpeaking = false;

  streamController = new AbortController();

  try {
    const response = await fetch(API_STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.5,
        max_tokens: 100,
        stream: true
      }),
      signal: streamController.signal
    });

    if (!response.ok) {
      throw new Error(`Stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      
      // Parse SSE data
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const token = parsed.token || parsed.content || parsed.text || '';
            
            if (token) {
              fullResponseText += token;
              sentenceBuffer += token;
              
              // Update caption with full text so far
              updateCaptionText(fullResponseText);
              
              // Check for sentence break to speak
              if (STREAM_CONFIG.speakBySentence) {
                const lastChar = token.trim().slice(-1);
                if (STREAM_CONFIG.sentenceBreaks.includes(lastChar) && 
                    sentenceBuffer.length >= STREAM_CONFIG.minCharsToSpeak) {
                  
                  if (!hasStartedSpeaking) {
                    hasStartedSpeaking = true;
                    showCaptionText(fullResponseText);
                    avatarStartTalking();
                    isSpeaking = true;
                    lowerMusicForSpeech();
                  }
                  
                  queueSpeechChunk(sentenceBuffer.trim(), false);
                  sentenceBuffer = "";
                }
              }
            }
          } catch (e) {
            // Not JSON, might be raw text
            if (data && data.trim()) {
              fullResponseText += data;
              sentenceBuffer += data;
              updateCaptionText(fullResponseText);
            }
          }
        }
      }
    }

    // Speak any remaining text
    if (sentenceBuffer.trim()) {
      if (!hasStartedSpeaking) {
        showCaptionText(fullResponseText);
        avatarStartTalking();
        isSpeaking = true;
        lowerMusicForSpeech();
      }
      queueSpeechChunk(sentenceBuffer.trim(), true);
    } else if (hasStartedSpeaking) {
      // Mark last queued chunk as final
      if (speechQueue.length > 0) {
        speechQueue[speechQueue.length - 1].isLast = true;
      } else {
        finishSpeaking();
      }
    } else if (fullResponseText.trim()) {
      // Fallback: speak entire response
      speak(fullResponseText);
    }

    // Save to history
    if (fullResponseText.trim()) {
      conversationHistory.push({ role: "assistant", content: fullResponseText });
      saveConversationHistory();
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      log("⏹️ Stream aborted");
    } else {
      console.error("Stream error:", err);
      log("❌ Stream error: " + err.message);
      
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
// NON-STREAMING FALLBACK
// ============================================
async function fetchFromBackend(text) {
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
    speak("Sorry, I had a connection issue. Can you try again?");
  }
}

function handlePracticeModeResponse(userText, reply) {
  try {
    const cleanedReply = reply.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanedReply);

    conversationHistory.push({ role: "assistant", content: parsed.reply });
    saveConversationHistory();

    showCorrection(
      userText, 
      parsed.corrected || userText, 
      parsed.explanation || "", 
      parsed.correctness || "wrong"
    );

    speak(parsed.reply);
  } catch (parseError) {
    console.error("Parse error:", parseError);
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
    log("✅ Avatar loaded!");
  } catch (err) {
    console.error("Avatar load failed:", err);
    log("❌ Avatar failed: " + err.message);
    
    if (avatarPath !== "/assets/vrmavatar1.vrm") {
      try {
        await loadVRMAvatar("/assets/vrmavatar1.vrm");
        currentAvatarPath = "/assets/vrmavatar1.vrm";
        saveAvatarChoice(currentAvatarPath);
      } catch (e) {
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

// Mode toggle
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
  });
}

// Music toggle
if (musicToggle) {
  musicToggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMusic();
  });
}

if (musicVolumeSlider) {
  musicVolumeSlider.addEventListener("input", (e) => {
    setMusicVolume(e.target.value / 100);
  });
}

// Microphone button
if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (isContinuousMode) {
      // Stop
      isContinuousMode = false;
      stopListening();
      stopSpeech();
      if (streamController) {
        streamController.abort();
        streamController = null;
      }
      isListening = false;
      isStreaming = false;

      micBtn.classList.remove("active");
      micBtn.textContent = "🎤";
      setStatus("Paused 💭", "paused");
      log("⏸️ Paused");
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
}

// Clear conversation
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (!confirm("Start fresh? This clears history.")) return;

    clearConversationStorage();
    stopSpeech();
    hideCaptionText();
    hideCorrection();

    setStatus("Fresh start! 🌟", "fresh");
    log("🔄 Fresh start");

    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
  });
}

// Demo lesson
if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", () => {
    const challenges = [
      "Tell me about something fun you did recently!",
      "What's your favorite thing to do on weekends?",
      "If you could learn any skill, what would it be?",
      "Tell me about a friend who's important to you.",
      "What's your favorite movie right now?",
      "Describe your perfect day!",
      "What's something new you learned lately?",
      "If you could travel anywhere, where would you go?",
    ];

    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    log(`✨ Challenge: "${challenge}"`);
    speak(challenge);

    menuPanel?.classList.remove("active");
    menuOverlay?.classList.remove("active");
  });
}

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
  log("🚀 Initializing (Low Latency Mode)...");

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
  setStatus(hasHistory ? "Welcome back! 😊" : "Ready to chat! 💭", hasHistory ? "welcome" : "ready");

  // Load voices
  if (window.speechSynthesis) {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      log(`🔊 ${voices.length} voices loaded`);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Request mic permission
  if (IS_MOBILE && navigator.mediaDevices?.getUserMedia) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      log("✅ Mic permission granted");
    } catch (err) {
      log("❌ Mic permission denied");
    }
  }

  log("✅ Ready! (Streaming: " + STREAM_CONFIG.useStreaming + ")");
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Cleanup
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) {
    stopSpeech();
  }
});

window.addEventListener("beforeunload", () => {
  stopSpeech();
  if (streamController) streamController.abort();
  if (isListening) stopListening();
});