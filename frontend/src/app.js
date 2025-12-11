// Spidey - Full-Screen Replika-Style Companion (Kids English Learning)
// Simplified, immersive, emotional experience

import { startListening, stopListening } from "./speech.js";
import { avatarStartTalking, avatarStopTalking } from "./threejs-avatar.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// DEVICE DETECTION
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// UI ELEMENTS
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

const chatBubble = document.getElementById("chatBubble");
const bubbleText = document.getElementById("bubbleText");

// STATE MANAGEMENT
let isListening = false;
let isSpeaking = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;

let captionChunks = [];
let currentChunkIndex = 0;
const CAPTION_CHAR_LIMIT = 150;

// STORAGE
const STORAGE_KEY = 'spidey_conversation_history';
const MAX_HISTORY_ITEMS = 200;

// LOGGING UTILITY
function log(msg) {
  if (logEl) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.innerHTML += '<span style="color:#999">[' + timestamp + ']</span> ' + msg + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log("[Spidey]", msg);
}

// LOCALSTORAGE PERSISTENCE
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

// CONVERSATION SUMMARY
function extractTopics(messages) {
  const topics = new Set();
  const keywords = [
    'family', 'friend', 'school', 'teacher', 'cricket', 'football',
    'movie', 'food', 'pet', 'dog', 'cat', 'favorite', 'yesterday',
    'tomorrow', 'weekend', 'exam', 'test', 'game', 'phone', 'computer'
  ];
  
  messages.forEach(function(msg) {
    const text = msg.content.toLowerCase();
    keywords.forEach(function(keyword) {
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

// CAPTION FUNCTIONS
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
  const words = chunk.split(' ');
  const wordsHTML = words.map(function(word, i) {
    return '<span class="caption-word" data-index="' + i + '">' + escapeHtml(word) + '</span>';
  }).join(' ');
  
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
  
  const allWords = captionText.querySelectorAll('.caption-word');
  allWords.forEach(function(w) { w.classList.remove('highlight'); });
  
  const currentWord = captionText.querySelector('[data-index="' + wordIndex + '"]');
  if (currentWord) {
    currentWord.classList.add('highlight');
  }
}

function hideCaption() {
  if (!captionBox) return;
  
  captionBox.classList.remove("active");
  captionChunks = [];
  currentChunkIndex = 0;
}

// CHAT BUBBLE DISPLAY
function showChatBubble(text) {
  if (!chatBubble || !bubbleText) return;
  
  bubbleText.textContent = text;
  chatBubble.classList.add("active");
  
  setTimeout(function() {
    hideChatBubble();
  }, 5000);
}

function hideChatBubble() {
  if (!chatBubble) return;
  chatBubble.classList.remove("active");
}

// STATUS UPDATES
function setStatus(message, type) {
  if (!statusEl) return;
  
  const friendlyMessages = {
    ready: "Hey friend! Ready to chat? 👋",
    listening: "I'm listening... 👂",
    thinking: "Hmm, let me think... 🤔",
    speaking: "Here's what I think... 💬",
    error: "Oops! Lost connection for a sec 😅"
  };
  
  statusEl.textContent = friendlyMessages[type] || message;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// MARKDOWN RENDERING
function renderReplyMarkdown(md) {
  const html = marked && marked.parse ? marked.parse(md) : md;
  const safe = DOMPurify && DOMPurify.sanitize ? DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }) : html;
  
  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

// PROMPT BUILDER (UNIFIED TONE FOR 10-15 YEAR OLDS)
function buildPrompt(userText) {
  const modeInstruction = isPracticeMode
    ? "PRACTICE MODE: Gently correct errors and show the right way in quotes. Be encouraging!"
    : "CASUAL CHAT MODE: Be a fun, supportive friend! Only mention big mistakes. Keep it light and friendly!";

  // UNIFIED TONE: Suitable for 10-15 year old kids (no class distinction)
  const toneGuide = "Teen-friendly, clear, relatable. Medium responses (40-60 words). Cool and supportive!";

  // EXPANDED CONTEXT: Last 20 messages
  const history = conversationHistory
    .slice(-20)
    .map(function(m) { return (m.role === "user" ? "Student" : "Spidey") + ": " + m.content; })
    .join("\n");
  
  // Add conversation summary
  const summary = generateConversationSummary();

  return "You are Spidey, a friendly English learning companion for kids (ages 10-15).\n\n" + 
         modeInstruction + "\n\n" +
         toneGuide + "\n\n" +
         "Context: You've been chatting with this student for " + conversationHistory.length + " messages. " + summary + "\n\n" +
         "Recent conversation:\n" + (history || "(First message)") + "\n\n" +
         "Student: \"" + userText + "\"\n\n" +
         "Respond as a supportive friend, not a formal teacher. Keep it 40-60 words. If correcting, put the correct sentence in quotes.";
}

// TTS TEXT CLEANUP
function cleanTextForSpeech(text) {
  if (!text) return "";
  
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .replace(/[*_~`#]/g, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\(([^)]+)\)/g, '')
    .replace(/[•▪▫►▻→↦]/g, '')
    .replace(/[★☆✓✔✗✘]/g, '')
    .replace(/[♠♣♥♦]/g, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\.{2,}/g, '.')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

// VOICE SELECTION
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  
  if (!voices || voices.length === 0) {
    console.warn("No voices available yet");
    return null;
  }

  const indianVoices = voices.filter(function(v) {
    return v.lang.startsWith("en-IN");
  });
  
  if (indianVoices.length > 0) {
    const femaleIndian = indianVoices.find(function(v) {
      return /female|woman|girl/i.test(v.name);
    });
    if (femaleIndian) {
      log("Using voice: " + femaleIndian.name);
      return femaleIndian;
    }
    log("Using voice: " + indianVoices[0].name);
    return indianVoices[0];
  }

  const englishVoices = voices.filter(function(v) {
    return v.lang.startsWith("en-US") || v.lang.startsWith("en-GB");
  });
  
  if (englishVoices.length > 0) {
    const premium = englishVoices.find(function(v) {
      return /premium|enhanced|natural|google|microsoft/i.test(v.name);
    });
    if (premium) {
      log("Using voice: " + premium.name);
      return premium;
    }
    
    const female = englishVoices.find(function(v) {
      return /female|woman|girl|samantha|victoria|zira/i.test(v.name);
    });
    if (female) {
      log("Using voice: " + female.name);
      return female;
    }
    
    log("Using voice: " + englishVoices[0].name);
    return englishVoices[0];
  }

  const anyEnglish = voices.find(function(v) {
    return v.lang.startsWith("en");
  });
  
  if (anyEnglish) {
    log("Using voice: " + anyEnglish.name);
    return anyEnglish;
  }

  log("Using voice: " + voices[0].name);
  return voices[0];
}

// TTS WITH AUTO-PLAY
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();
  
  const cleanedText = cleanTextForSpeech(text);
  lastSpokenText = cleanedText;

  const utter = new SpeechSynthesisUtterance(cleanedText);
  utter.lang = "en-IN";
  
  if (isMobileDevice()) {
    utter.rate = 0.9;
    utter.pitch = 1.0;
    utter.volume = 1;
  } else {
    utter.rate = 0.95;
    utter.pitch = 1.25;
    utter.volume = 1;
  }

  const bestVoice = selectBestVoice();
  if (bestVoice) utter.voice = bestVoice;

  let wordIndex = 0;
  let highlightInterval = null;

  const words = cleanedText.split(' ');
  const avgWordDuration = (cleanedText.length / words.length) * 100 / utter.rate;

  utter.onstart = function() {
    isSpeaking = true;
    if (avatarStartTalking) avatarStartTalking();
    showCaption(cleanedText);
    
    setStatus("Here's what I think... 💬", "speaking");
    log("Speech started");

    highlightInterval = setInterval(function() {
      if (wordIndex < words.length) {
        highlightCaptionWord(wordIndex);
        wordIndex++;
        
        const currentWords = captionChunks[currentChunkIndex] ? 
          captionChunks[currentChunkIndex].split(' ').length : 0;
        
        if (wordIndex >= currentWords && currentChunkIndex < captionChunks.length - 1) {
          wordIndex = 0;
          setTimeout(function() {
            advanceToNextChunk();
          }, 200);
        }
      } else {
        clearInterval(highlightInterval);
      }
    }, avgWordDuration);
  };

  utter.onboundary = function(event) {
    if (event.name === 'word' && highlightInterval) {
      clearInterval(highlightInterval);
      highlightInterval = null;
      
      highlightCaptionWord(wordIndex);
      wordIndex++;
      
      const currentWords = captionChunks[currentChunkIndex] ? 
        captionChunks[currentChunkIndex].split(' ').length : 0;
      
      if (wordIndex >= currentWords) {
        wordIndex = 0;
        setTimeout(function() {
          advanceToNextChunk();
        }, 800);
      }
    }
  };

  utter.onend = function() {
    if (highlightInterval) clearInterval(highlightInterval);
    
    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaption();
    
    setStatus("Your turn, friend! 👋", "ready");
    log("Speech ended");
  };

  utter.onerror = function(event) {
    console.error("Speech error:", event);
    if (highlightInterval) clearInterval(highlightInterval);
    
    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaption();
    
    setStatus("Oops! Lost my voice for a sec 😅", "error");
  };

  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  
  isSpeaking = false;
  if (avatarStopTalking) avatarStopTalking();
  hideCaption();
  
  log("Speech stopped");
}

// BACKEND COMMUNICATION
async function sendToBackend(text) {
  if (!text.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();
  
  showChatBubble(text);
  setStatus("Hmm, let me think... 🤔", "thinking");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.35,
        max_tokens: 200
      })
    });

    if (!res.ok) {
      throw new Error("Backend error: " + res.status);
    }

    const data = await res.json();
    const reply = data.reply || "Great job! Keep practicing!";

    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();

    const speakable = renderReplyMarkdown(reply);
    speak(speakable);

  } catch (err) {
    console.error("Backend error:", err);
    
    showChatBubble("Oops! I lost connection for a moment. Can you try again? 😅");
    setStatus("Oops! Lost connection for a sec 😅", "error");
  }
}

// EVENT LISTENERS

// Menu Toggle
if (menuToggle) {
  menuToggle.addEventListener("click", function() {
    menuPanel.classList.add("active");
    menuOverlay.classList.add("active");
  });
}

if (menuClose) {
  menuClose.addEventListener("click", function() {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener("click", function() {
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Mode Toggle
if (modeToggle) {
  modeToggle.addEventListener("click", function() {
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

// Mic Button
if (micBtn) {
  micBtn.addEventListener("click", function() {
    if (isListening) {
      stopListening();
      isListening = false;
      
      micBtn.classList.remove("active");
      const label = micBtn.querySelector(".mic-label");
      if (label) label.textContent = "Talk to Spidey";
      
      setStatus("Your turn, friend! 👋", "ready");
    } else {
      stopSpeech();
      isListening = true;
      
      micBtn.classList.add("active");
      const label = micBtn.querySelector(".mic-label");
      if (label) label.textContent = "Stop";
      
      setStatus("I'm listening... 👂", "listening");
      startListening(sendToBackend);
    }
  });
}

// Clear Button
if (clearBtn) {
  clearBtn.addEventListener("click", function() {
    const confirmed = confirm("Start fresh? This will clear our chat history.");
    if (!confirmed) return;
    
    clearConversationStorage();
    stopSpeech();
    hideCaption();
    hideChatBubble();
    
    setStatus("Fresh start! Let's chat! 🌟", "ready");
    log("Chat cleared - fresh start");
    
    // Close menu
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// Demo Lesson Button
if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", function() {
    const challenges = [
      "Tell me about your favorite food.",
      "Describe your best friend.",
      "What did you do yesterday?",
      "Where would you like to visit?",
      "What's your favorite subject in school?"
    ];
    
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    speak("Here's a fun challenge for you: " + challenge);
    
    // Close menu
    menuPanel.classList.remove("active");
    menuOverlay.classList.remove("active");
  });
}

// INITIALIZATION
function initialize() {
  log("Spidey - Full-Screen Companion Ready! 🕷️");
  
  const hasHistory = loadConversationHistory();
  
  if (hasHistory) {
    log("✅ Previous conversation restored!");
    setStatus("Hey! I missed you! 😊", "ready");
  } else {
    setStatus("Hey friend! Ready to chat? 👋", "ready");
  }
  
  // Enhanced voice loading
  if (window.speechSynthesis) {
    let voices = window.speechSynthesis.getVoices();
    
    if (voices.length > 0) {
      log(voices.length + " voices loaded immediately");
    } else {
      log("Waiting for voices to load...");
    }
    
    window.speechSynthesis.onvoiceschanged = function() {
      voices = window.speechSynthesis.getVoices();
      log(voices.length + " voices loaded");
      
      voices.forEach(function(voice, i) {
        if (voice.lang.startsWith("en")) {
          console.log(i + ": " + voice.name + " (" + voice.lang + ")");
        }
      });
    };
    
    if (isMobileDevice()) {
      setTimeout(function() {
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

document.addEventListener("visibilitychange", function() {
  if (document.hidden && isSpeaking) {
    stopSpeech();
  }
});

window.addEventListener("beforeunload", function() {
  stopSpeech();
  if (isListening) {
    stopListening();
  }
});