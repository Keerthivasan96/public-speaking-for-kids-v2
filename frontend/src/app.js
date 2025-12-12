// Spidey - Continuous Conversation Mode (Replika-style)
// Full-Screen Companion with hands-free conversation

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

const captionBox = document.getElementById("caption-box");
const captionText = document.getElementById("caption-text");

const micContainer = document.getElementById("mic-container");
const chatCaption = document.getElementById("chatCaption");

const chatBubble = document.getElementById("chatBubble");
const bubbleText = document.getElementById("bubbleText");

/* ============================
   STATE
   ============================ */
let isListening = false;
let isSpeaking = false;
let isContinuousMode = false; // NEW: Continuous conversation flag
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;

let captionChunks = [];
let currentChunkIndex = 0;
const CAPTION_CHAR_LIMIT = 150;

/* ============================
   STORAGE
   ============================ */
const STORAGE_KEY = "spidey_conversation_history";
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
  console.log("[Spidey]", msg);
}

/* ============================
   LOCAL STORAGE
   ============================ */
function saveConversationHistory() {
  try {
    const historyToSave = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyToSave));
    log("💾 Conversation saved (" + historyToSave.length + " messages)");
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
   Conversation summary helpers
   ============================ */
function extractTopics(messages) {
  const topics = new Set();
  const keywords = [
    "family", "friend", "school", "teacher", "cricket", "football",
    "movie", "food", "pet", "dog", "cat", "favorite", "yesterday",
    "tomorrow", "weekend", "exam", "test", "game", "phone", "computer"
  ];

  messages.forEach(function (msg) {
    const text = msg.content.toLowerCase();
    keywords.forEach(function (keyword) {
      if (text.includes(keyword)) {
        topics.add(keyword);
      }
    });
  });

  return Array.from(topics).slice(0, 5);
}

function generateConversationSummary() {
  if (conversationHistory.length < 10) return "";

  const topics = extractTopics(conversationHistory);
  if (topics.length === 0) return "";

  return "Previous topics: " + topics.join(", ") + ".";
}

/* ============================
   CAPTION FUNCTIONS (UPDATED)
   ============================ */
function chunkText(text, maxChars) {
  maxChars = maxChars || CAPTION_CHAR_LIMIT;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChars) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

function showCaption(text) {
  if (!captionBox || !captionText) return;

  captionChunks = chunkText(text, CAPTION_CHAR_LIMIT);
  currentChunkIndex = 0;

  displayCaptionChunk(0);
  captionBox.classList.add("active");

  log("Caption shown: " + captionChunks.length + " chunk(s)");
}

function displayCaptionChunk(index) {
  if (!captionText || index >= captionChunks.length) return;

  const chunk = captionChunks[index];
  const words = chunk.split(" ");
  const wordsHTML = words
    .map(function (word, i) {
      return '<span class="caption-word" data-index="' + i + '">' + escapeHtml(word) + "</span>";
    })
    .join(" ");

  captionText.innerHTML = wordsHTML;
  currentChunkIndex = index;
}

function advanceToNextChunk() {
  if (currentChunkIndex < captionChunks.length - 1) {
    displayCaptionChunk(currentChunkIndex + 1);
    return true;
  }
  return false;
}

function highlightCaptionWord(wordIndex) {
  if (!captionText) return;

  const allWords = captionText.querySelectorAll(".caption-word");
  allWords.forEach(function (w) {
    w.classList.remove("highlight");
  });

  const currentWord = captionText.querySelector('[data-index="' + wordIndex + '"]');
  if (currentWord) {
    currentWord.classList.add("highlight");
  }
}

function hideCaption() {
  if (!captionBox) return;

  captionBox.classList.remove("active");
  captionChunks = [];
  currentChunkIndex = 0;
}

/* -------------------------
   Compact caption (NEW: stays until TTS ends)
   ------------------------- */
export function showCaptionText(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
  
  // Clear any existing timer
  clearTimeout(window.__captionHideTimer);
  // Caption will be hidden when TTS ends (in speak function)
}

function hideCaptionText() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
  clearTimeout(window.__captionHideTimer);
}

/* ============================
   CHAT BUBBLE (REMOVED - no user transcript display)
   ============================ */
function showChatBubble(text) {
  // Disabled - we don't show user's spoken text anymore
  return;
}

function hideChatBubble() {
  if (!chatBubble) return;
  chatBubble.classList.remove("active");
}

/* ============================
   STATUS
   ============================ */
function setStatus(message, type) {
  if (!statusEl) return;

  const friendlyMessages = {
    ready: "Ready to chat! 💭",
    listening: "I'm listening... 👂",
    thinking: "Thinking... 🤔",
    speaking: "💬",
    error: "Connection issue 😅",
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
  const modeInstruction = isPracticeMode
    ? "Practice mode: If you notice a grammar mistake, gently mention it once and show the correct way. Keep it encouraging."
    : "Casual chat: Be a supportive friend. Only mention major errors if they hurt clarity. Stay natural and warm.";

  const toneGuide = "Speak like a caring 16-year-old friend. Keep replies short (30-50 words). Be genuine, not repetitive. No catchphrases.";

  const history = conversationHistory.slice(-20).map(function (m) {
    return (m.role === "user" ? "Student" : "Friend") + ": " + m.content;
  }).join("\n");

  const summary = generateConversationSummary();

  return `You are a friendly English conversation companion for teens (12-15 years old).

${modeInstruction}

${toneGuide}

Context: You've had ${conversationHistory.length} exchanges. ${summary}

Recent chat:
${history || "(First message)"}

Student: "${userText}"

Reply naturally in 30-50 words. Be warm, not robotic. Vary your responses.`;
}

/* ============================
   TTS CLEANUP & VOICE SELECTION
   ============================ */
function cleanTextForSpeech(text) {
  if (!text) return "";

  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F700}-\u{1F77F}]/gu, "")
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, "")
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[*_~`#]/g, "")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\(([^)]+)\)/g, "")
    .replace(/[•▪▫►▻→↦]/g, "")
    .replace(/[★☆✓✔✗✘]/g, "")
    .replace(/[♠♣♥♦]/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\.{2,}/g, ".")
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();

  if (!voices || voices.length === 0) {
    console.warn("No voices available yet");
    return null;
  }

  // Priority 1: Female Indian English voices (age-appropriate)
  const femaleIndian = voices.filter(function (v) {
    return v.lang.startsWith("en-IN") && /female|woman|girl/i.test(v.name);
  });

  if (femaleIndian.length > 0) {
    log("Using voice: " + femaleIndian[0].name);
    return femaleIndian[0];
  }

  // Priority 2: Any Indian English voice
  const indianVoices = voices.filter(function (v) {
    return v.lang.startsWith("en-IN");
  });

  if (indianVoices.length > 0) {
    log("Using voice: " + indianVoices[0].name);
    return indianVoices[0];
  }

  // Priority 3: Female English voices (US/GB)
  const femaleEnglish = voices.filter(function (v) {
    return (v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) && 
           /female|woman|girl|samantha|victoria|zira|fiona/i.test(v.name);
  });

  if (femaleEnglish.length > 0) {
    log("Using voice: " + femaleEnglish[0].name);
    return femaleEnglish[0];
  }

  // Priority 4: Any English voice
  const anyEnglish = voices.find(function (v) {
    return v.lang.startsWith("en");
  });

  if (anyEnglish) {
    log("Using voice: " + anyEnglish.name);
    return anyEnglish;
  }

  log("Using voice: " + voices[0].name);
  return voices[0];
}

/* ============================
   TTS (UPDATED: caption stays until end)
   ============================ */
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();

  const cleanedText = cleanTextForSpeech(text);
  lastSpokenText = cleanedText;

  const utter = new SpeechSynthesisUtterance(cleanedText);
  utter.lang = "en-IN";

  if (isMobileDevice()) {
    utter.rate = 0.9;
    utter.pitch = 1.1; // Slightly higher for younger voice
    utter.volume = 1;
  } else {
    utter.rate = 0.95;
    utter.pitch = 1.2; // Teen-friendly pitch
    utter.volume = 1;
  }

  const bestVoice = selectBestVoice();
  if (bestVoice) utter.voice = bestVoice;

  let wordIndex = 0;
  let highlightInterval = null;

  const words = cleanedText.split(" ");
  const avgWordDuration = (cleanedText.length / words.length) * 100 / utter.rate;

  utter.onstart = function () {
    isSpeaking = true;
    if (avatarStartTalking) avatarStartTalking();

    // Show caption - it will stay until TTS ends
    showCaptionText(cleanedText);
    showCaption(cleanedText);

    setStatus("💬", "speaking");
    log("Speech started");

    highlightInterval = setInterval(function () {
      if (wordIndex < words.length) {
        highlightCaptionWord(wordIndex);
        wordIndex++;

        const currentWords = captionChunks[currentChunkIndex] ? captionChunks[currentChunkIndex].split(" ").length : 0;

        if (wordIndex >= currentWords && currentChunkIndex < captionChunks.length - 1) {
          wordIndex = 0;
          setTimeout(function () {
            advanceToNextChunk();
          }, 200);
        }
      } else {
        clearInterval(highlightInterval);
      }
    }, avgWordDuration);
  };

  utter.onboundary = function (event) {
    if (event.name === "word" && highlightInterval) {
      clearInterval(highlightInterval);
      highlightInterval = null;

      highlightCaptionWord(wordIndex);
      wordIndex++;

      const currentWords = captionChunks[currentChunkIndex] ? captionChunks[currentChunkIndex].split(" ").length : 0;

      if (wordIndex >= currentWords) {
        wordIndex = 0;
        setTimeout(function () {
          advanceToNextChunk();
        }, 800);
      }
    }
  };

  utter.onend = function () {
    if (highlightInterval) clearInterval(highlightInterval);

    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaption();
    hideCaptionText(); // Hide caption when speech ends

    // NEW: If continuous mode is on, restart listening
    if (isContinuousMode) {
      setTimeout(function() {
        startNextListeningCycle();
      }, 800); // Small pause before listening again
    } else {
      setStatus("Your turn! 💭", "ready");
    }

    log("Speech ended");
  };

  utter.onerror = function (event) {
    console.error("Speech error:", event);
    if (highlightInterval) clearInterval(highlightInterval);

    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaption();
    hideCaptionText();

    setStatus("Connection issue 😅", "error");
    
    // Retry continuous mode after error
    if (isContinuousMode) {
      setTimeout(function() {
        startNextListeningCycle();
      }, 1500);
    }
  };

  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  window.speechSynthesis.cancel();

  isSpeaking = false;
  if (avatarStopTalking) avatarStopTalking();
  hideCaption();
  hideCaptionText();

  log("Speech stopped");
}

/* ============================
   CONTINUOUS CONVERSATION LOGIC
   ============================ */
function startNextListeningCycle() {
  if (!isContinuousMode || isSpeaking) return;

  setStatus("I'm listening... 👂", "listening");
  isListening = true;
  startListening(handleUserSpeech, { continuous: false });
}

function handleUserSpeech(text) {
  if (!text || !text.trim()) {
    // If no speech detected, restart listening in continuous mode
    if (isContinuousMode) {
      setTimeout(function() {
        startNextListeningCycle();
      }, 500);
    }
    return;
  }

  log("User said: " + text);
  
  // Don't show user transcript on screen anymore
  sendToBackend(text);
}

/* ============================
   BACKEND COMMUNICATION
   ============================ */
async function sendToBackend(text) {
  if (!text || !text.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();

  setStatus("Thinking... 🤔", "thinking");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.4, // Slightly higher for more natural variety
        max_tokens: 120, // Shorter replies
      }),
    });

    if (!res.ok) {
      throw new Error("Backend error: " + res.status);
    }

    const data = await res.json();
    const reply = data.reply || "I'm here for you!";

    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();

    const speakable = renderReplyMarkdown(reply);
    speak(speakable);
  } catch (err) {
    console.error("Backend error:", err);

    setStatus("Connection issue 😅", "error");
    speak("Sorry, I lost connection. Can you say that again?");
  }
}

/* ============================
   EVENT LISTENERS (UI)
   ============================ */

// Menu Toggle
if (menuToggle) {
  menuToggle.addEventListener("click", function () {
    menuPanel.classList.add("active");
    menuOverlay.classList.add("active");
  });
}

if (menuClose) {
  menuClose.addEventListener("click", function () {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener("click", function () {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Mode Toggle
if (modeToggle) {
  modeToggle.addEventListener("click", function () {
    isPracticeMode = !isPracticeMode;
    modeToggle.classList.toggle("active", isPracticeMode);

    const label = modeToggle.querySelector(".mode-label");
    if (label) {
      label.textContent = isPracticeMode ? "Practice Mode" : "Casual Chat";
    }

    const modeText = isPracticeMode ? "Practice Mode ON! 📝" : "Casual Chat mode! 💬";
    log(modeText);
    setStatus(modeText, isPracticeMode ? "thinking" : "ready");
  });
}

// Mic Button (UPDATED: toggles continuous mode)
if (micBtn) {
  micBtn.addEventListener("click", function () {
    if (isContinuousMode) {
      // Stop continuous mode
      isContinuousMode = false;
      stopListening();
      stopSpeech();
      isListening = false;

      micBtn.classList.remove("active", "recording");
      micBtn.textContent = "🎤";
      micBtn.title = "Start conversation";

      setStatus("Paused 💭", "ready");
      log("Continuous mode stopped");
    } else {
      // Start continuous mode
      isContinuousMode = true;
      micBtn.classList.add("active");
      micBtn.textContent = "⏸️";
      micBtn.title = "Pause conversation";

      setStatus("I'm listening... 👂", "listening");
      log("Continuous mode started");
      
      startNextListeningCycle();
    }
  });
}

// Clear Button
if (clearBtn) {
  clearBtn.addEventListener("click", function () {
    const confirmed = confirm("Start fresh? This will clear our chat history.");
    if (!confirmed) return;

    clearConversationStorage();
    stopSpeech();
    hideCaption();
    hideCaptionText();
    hideChatBubble();

    setStatus("Fresh start! 🌟", "ready");
    log("Chat cleared - fresh start");

    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Demo Lesson Button
if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", function () {
    const challenges = [
      "Tell me about something that made you happy today.",
      "What's your favorite way to spend free time?",
      "Describe someone you admire.",
      "What's something new you'd like to learn?",
      "Tell me about a place you'd love to visit.",
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
  log("Conversation Companion Ready! 💬");

  try {
    if (micContainer) {
      const existingMic = document.getElementById("micBtn");
      if (existingMic && existingMic.parentElement !== micContainer) {
        micContainer.appendChild(existingMic);
        document.body.classList.add("has-left-mic");
        log("Moved mic into #mic-container");
      }
    }
  } catch (e) {
    console.warn("Mic container hookup failed", e);
  }

  const hasHistory = loadConversationHistory();

  if (hasHistory) {
    log("✅ Previous conversation restored!");
    setStatus("Welcome back! 💭", "ready");
  } else {
    setStatus("Ready to chat! 💭", "ready");
  }

  // Enhanced voice loading
  if (window.speechSynthesis) {
    let voices = window.speechSynthesis.getVoices();

    if (voices.length > 0) {
      log(voices.length + " voices loaded immediately");
    } else {
      log("Waiting for voices to load...");
    }

    window.speechSynthesis.onvoiceschanged = function () {
      voices = window.speechSynthesis.getVoices();
      log(voices.length + " voices loaded");

      voices.forEach(function (voice, i) {
        if (voice.lang.startsWith("en")) {
          console.log(i + ": " + voice.name + " (" + voice.lang + ")");
        }
      });
    };

    if (isMobileDevice()) {
      setTimeout(function () {
        window.speechSynthesis.getVoices();
      }, 100);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

document.addEventListener("visibilitychange", function () {
  if (document.hidden && isSpeaking) {
    stopSpeech();
  }
});

window.addEventListener("beforeunload", function () {
  stopSpeech();
  if (isListening) {
    stopListening();
  }
});