// frontend/src/app.js
// KIDS3D TEACHER - REPLIKA-INSPIRED VERSION (December 2025)
// Continuous chat companion with expanded memory and timeline UI
// 30% Replika-like: Persistent memory + Chat timeline + Friendly language

import { startListening, stopListening } from "./speech.js";
import { avatarStartTalking, avatarStopTalking } from "./threejs-avatar.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// ============================================================================
// LOCALSTORAGE CONFIGURATION (EXPANDED FOR REPLIKA-STYLE)
// ============================================================================
const STORAGE_KEY = 'kids3d_conversation_history';
const MAX_HISTORY_ITEMS = 200; // Increased from 50 for longer memory

// DEVICE DETECTION
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ============================================================================
// UI ELEMENTS
// ============================================================================
const micBtn = document.getElementById("micBtn");
const testBtn = document.getElementById("testBtn");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");
const menuBtn = document.getElementById("menuBtn");
const advancedMenu = document.getElementById("advancedMenu");

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");

const schoolMode = document.getElementById("schoolMode");
const classButtons = document.querySelectorAll(".class-btn");
const modeToggle = document.getElementById("modeToggle");

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatTimeline = document.getElementById("chatTimeline");

const captionBox = document.getElementById("caption-box");
const captionText = document.getElementById("caption-text");

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isListening = false;
let isSpeaking = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;

let captionChunks = [];
let currentChunkIndex = 0;
const CAPTION_CHAR_LIMIT = 150;

// ============================================================================
// LOGGING UTILITY
// ============================================================================
function log(msg) {
  if (logEl) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.innerHTML += '<span style="color:#999">[' + timestamp + ']</span> ' + msg + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log("[Kids3D Teacher]", msg);
}

// ============================================================================
// LOCALSTORAGE PERSISTENCE (EXPANDED CAPACITY)
// ============================================================================

function saveConversationHistory() {
  try {
    const historyToSave = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyToSave));
    log("💾 Conversation saved (" + historyToSave.length + " messages)");
  } catch (err) {
    console.error("Failed to save conversation:", err);
    log("⚠️ Could not save conversation (storage full?)");
  }
}

function loadConversationHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      log("📂 Loaded " + conversationHistory.length + " messages from history");
      return true;
    }
  } catch (err) {
    console.error("Failed to load conversation:", err);
    log("⚠️ Could not load conversation history");
  }
  return false;
}

function clearConversationStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    conversationHistory = [];
    if (chatTimeline) chatTimeline.innerHTML = "";
    log("🗑️ Storage cleared");
  } catch (err) {
    console.error("Failed to clear storage:", err);
  }
}

// ============================================================================
// CONVERSATION SUMMARY GENERATOR (HELPS AI REMEMBER CONTEXT)
// ============================================================================

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

// ============================================================================
// CAPTION BOX WITH CHUNKING & WORD HIGHLIGHTING
// ============================================================================

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
  
  setTimeout(function() {
    if (captionText && !captionBox.classList.contains("active")) {
      captionText.textContent = "Ready to chat more? 😊";
    }
  }, 400);
}

// ============================================================================
// SMART CORRECTION DETECTION
// ============================================================================

function analyzeSentenceQuality(userText, correctedText, aiResponse) {
  const userLower = userText.toLowerCase().trim();
  const correctedLower = correctedText.toLowerCase().trim();
  
  const hasCorrection = userLower !== correctedLower;
  
  if (hasCorrection) {
    const similarity = calculateSimilarity(userLower, correctedLower);
    
    const majorErrorKeywords = [
      'wrong', 'mistake', 'incorrect', 'error', 'should say',
      'must use', 'need to say', 'correct way', 'fix this'
    ];
    
    const hasMajorError = majorErrorKeywords.some(function(keyword) {
      return aiResponse.toLowerCase().includes(keyword);
    });
    
    const minorErrorKeywords = [
      'could improve', 'better to say', 'try using', 'sounds better',
      'more natural', 'consider', 'tiny mix-up', 'small change'
    ];
    
    const hasMinorError = minorErrorKeywords.some(function(keyword) {
      return aiResponse.toLowerCase().includes(keyword);
    });
    
    if (hasMajorError || similarity < 0.5) {
      return 'wrong';
    } else if (hasMinorError || similarity < 0.85) {
      return 'needs-improvement';
    } else {
      return 'needs-improvement';
    }
  }
  
  return 'perfect';
}

function extractCorrection(userText, aiResponse) {
  let correctedText = userText;
  
  const patterns = [
    /(?:should say|correct (?:way|version|sentence) is?|better to say|try saying|say it (?:like|as))[:\s]*["']([^"']+)["']/i,
    /(?:say|use)[:\s]*["']([^"']+)["']\s*instead/i,
    /instead[,\s]+(?:say|use|try)[:\s]*["']([^"']+)["']\s*instead/i,
    /["']([^"']+)["']\s+is (?:better|correct|more natural|proper)/i,
    /correct(?:ed)?[:\s]*["']([^"']+)["']/i,
    /(?:use|say)\s+["']?(\w+)["']?\s+instead/i,
    /should (?:be|say)[:\s]*["']([^"']+)["']/i,
    /["']I (met|went|saw|did|made|took)([^"']+)["']/i,
    /["'](What|Where|When|How|Why|Who)\s+is\s+([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = aiResponse.match(pattern);
    if (match) {
      if (match[1]) {
        correctedText = match[1].trim();
        log("Correction found: " + correctedText);
        break;
      }
      if (match[2]) {
        correctedText = "I " + match[1] + match[2];
        log("Past tense correction: " + correctedText);
        break;
      }
    }
  }

  if (correctedText === userText) {
    const allQuotes = aiResponse.match(/["']([^"']{10,})["']/g);
    if (allQuotes && allQuotes.length > 0) {
      for (const quote of allQuotes) {
        const quoted = quote.replace(/["']/g, '').trim();
        if (quoted.toLowerCase() !== userText.toLowerCase() && 
            calculateSimilarity(quoted, userText) > 0.4) {
          correctedText = quoted;
          log("Found via quote: " + correctedText);
          break;
        }
      }
    }
  }

  return { correctedText: correctedText };
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// REPLIKA-STYLE CHAT TIMELINE (INLINE CORRECTIONS)
// ============================================================================

function addMessageToTimeline(role, text, correction = null) {
  if (!chatTimeline) return;
  
  const bubble = document.createElement("div");
  bubble.className = "message-bubble " + role;
  
  const timestamp = new Date().toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  let correctionHtml = "";
  if (correction && correction.quality !== "perfect") {
    const icon = correction.quality === "wrong" ? "❌" : "⚠️";
    correctionHtml = '<div class="correction-hint">' + icon + ' Better: "' + escapeHtml(correction.correctedText) + '"</div>';
  } else if (correction && correction.quality === "perfect") {
    correctionHtml = '<div class="correction-hint perfect">✅ Perfect sentence!</div>';
  }
  
  if (role === "assistant") {
    bubble.innerHTML = '<div class="avatar-icon">🕷️</div><div class="bubble-content">' + escapeHtml(text) + correctionHtml + '</div><div class="timestamp">' + timestamp + '</div>';
  } else {
    bubble.innerHTML = '<div class="bubble-content">' + escapeHtml(text) + '</div><div class="timestamp">' + timestamp + '</div>';
  }
  
  chatTimeline.appendChild(bubble);
  
  // Smooth scroll to bottom
  setTimeout(function() {
    chatTimeline.scrollTo({ 
      top: chatTimeline.scrollHeight, 
      behavior: "smooth" 
    });
  }, 100);
}

function showTypingIndicator() {
  if (!chatTimeline) return;
  
  const indicator = document.createElement("div");
  indicator.className = "message-bubble assistant typing-indicator";
  indicator.id = "typing-indicator";
  indicator.innerHTML = '<div class="avatar-icon">🕷️</div><div class="typing-dots"><span></span><span></span><span></span></div>';
  
  chatTimeline.appendChild(indicator);
  chatTimeline.scrollTo({ 
    top: chatTimeline.scrollHeight, 
    behavior: "smooth" 
  });
}

function hideTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

function renderSavedConversation() {
  if (!chatTimeline || conversationHistory.length === 0) return;
  
  conversationHistory.forEach(function(msg) {
    if (msg.role === "user") {
      addMessageToTimeline("user", msg.content);
    } else {
      addMessageToTimeline("assistant", msg.content);
    }
  });
  
  log("📋 Rendered " + conversationHistory.length + " saved messages");
}

// ============================================================================
// MARKDOWN RENDERING
// ============================================================================

function renderReplyMarkdown(md) {
  const html = marked && marked.parse ? marked.parse(md) : md;
  const safe = DOMPurify && DOMPurify.sanitize ? DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }) : html;
  
  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

// ============================================================================
// PROMPT BUILDER (EXPANDED MEMORY: 20 MESSAGES + SUMMARY)
// ============================================================================

function buildPrompt(userText) {
  const currentClass = schoolMode && schoolMode.value ? schoolMode.value : "class7";

  const modeInstruction = isPracticeMode
    ? "PRACTICE MODE: Gently correct errors and show the right way in quotes. Be encouraging!"
    : "CASUAL CHAT MODE: Be a fun, supportive friend! Only mention big mistakes. Use emojis and keep it light!";

  const gradeConfig = {
    class3: "Use simple words, lots of excitement! Short responses (30-50 words). Use emojis!",
    class7: "Teen-friendly tone, clear but gentle corrections. Medium responses (50-80 words).",
    class10: "Professional mentor, fluency focus, interview prep. Detailed responses (60-100 words)."
  };

  const gradeText = gradeConfig[currentClass] || gradeConfig.class7;
  
  // EXPANDED CONTEXT: Last 20 messages instead of 6
  const history = conversationHistory
    .slice(-20)
    .map(function(m) { return (m.role === "user" ? "Student" : "Spidey") + ": " + m.content; })
    .join("\n");
  
  // Add conversation summary for long-term context
  const summary = generateConversationSummary();

  return "You are Spidey, a friendly English learning companion for Indian kids.\n\n" + 
         modeInstruction + "\n\n" +
         "Level: " + currentClass + " - " + gradeText + "\n\n" +
         "Context: You've been chatting with this student for " + conversationHistory.length + " messages. " + summary + "\n\n" +
         "Recent conversation:\n" + (history || "(First message)") + "\n\n" +
         "Student: \"" + userText + "\"\n\n" +
         "Respond as a supportive friend, not a formal teacher. If correcting, put the correct sentence in quotes.";
}

// ============================================================================
// TTS TEXT CLEANUP
// ============================================================================

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

// ============================================================================
// SMART VOICE SELECTION
// ============================================================================

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
      log("Using voice: " + femaleIndian.name + " (Indian Female)");
      return femaleIndian;
    }
    log("Using voice: " + indianVoices[0].name + " (Indian)");
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
      log("Using voice: " + premium.name + " (Premium)");
      return premium;
    }
    
    const female = englishVoices.find(function(v) {
      return /female|woman|girl|samantha|victoria|zira/i.test(v.name);
    });
    if (female) {
      log("Using voice: " + female.name + " (Female)");
      return female;
    }
    
    log("Using voice: " + englishVoices[0].name);
    return englishVoices[0];
  }

  const anyEnglish = voices.find(function(v) {
    return v.lang.startsWith("en");
  });
  
  if (anyEnglish) {
    log("Using voice: " + anyEnglish.name + " (Generic English)");
    return anyEnglish;
  }

  log("Using voice: " + voices[0].name + " (Fallback)");
  return voices[0];
}

// ============================================================================
// TTS WITH AUTO-PLAY
// ============================================================================

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

// ============================================================================
// FRIENDLY STATUS MESSAGES (REPLIKA-STYLE)
// ============================================================================

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
  
  const colors = {
    ready: "#4caf50",
    listening: "#2196f3",
    thinking: "#ff9800",
    speaking: "#9c27b0",
    error: "#f44336"
  };
  
  statusEl.style.color = colors[type] || "#666";
}

// ============================================================================
// BACKEND COMMUNICATION
// ============================================================================

async function sendToBackend(text) {
  if (!text.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  saveConversationHistory();
  
  // Add user message to timeline
  addMessageToTimeline("user", text);
  
  // Show typing indicator
  showTypingIndicator();
  setStatus("Hmm, let me think... 🤔", "thinking");

  const currentClass = schoolMode && schoolMode.value ? schoolMode.value : "class7";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: currentClass === "class3" ? 0.2 : 0.35,
        max_tokens: currentClass === "class3" ? 120 : currentClass === "class10" ? 300 : 200
      })
    });

    if (!res.ok) {
      throw new Error("Backend error: " + res.status);
    }

    const data = await res.json();
    const reply = data.reply || "Great job! Keep practicing!";

    conversationHistory.push({ role: "assistant", content: reply });
    saveConversationHistory();

    // Hide typing indicator
    hideTypingIndicator();

    // Extract correction and analyze quality
    const extraction = isPracticeMode ? extractCorrection(text, reply) : { correctedText: text };
    const correctedText = extraction.correctedText;
    const quality = analyzeSentenceQuality(text, correctedText, reply);

    // Add AI message to timeline with inline correction
    const correction = {
      correctedText: correctedText,
      quality: quality
    };
    
    addMessageToTimeline("assistant", reply, correction);

    // Speak the response
    const speakable = renderReplyMarkdown(reply);
    speak(speakable);

  } catch (err) {
    console.error("Backend error:", err);
    hideTypingIndicator();
    
    addMessageToTimeline("assistant", "Oops! I lost connection for a moment. Can you try again? 😅");
    setStatus("Oops! Lost connection for a sec 😅", "error");
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

if (menuBtn) {
  menuBtn.addEventListener("click", function() {
    if (advancedMenu) {
      advancedMenu.classList.toggle("visible");
    }
  });
}

if (modeToggle) {
  modeToggle.addEventListener("click", function() {
    isPracticeMode = !isPracticeMode;
    modeToggle.classList.toggle("active", isPracticeMode);
    
    const modeText = isPracticeMode ? "Practice Mode ON!" : "Casual Chat mode!";
    log(modeText);
    
    setStatus(modeText, isPracticeMode ? "thinking" : "ready");
  });
}

if (micBtn) {
  micBtn.addEventListener("click", function() {
    if (isListening) {
      stopListening();
      isListening = false;
      
      micBtn.classList.remove("active");
      const label = micBtn.querySelector(".label");
      if (label) label.textContent = "Talk to Spidey";
      
      setStatus("Your turn, friend! 👋", "ready");
    } else {
      stopSpeech();
      isListening = true;
      
      micBtn.classList.add("active");
      const label = micBtn.querySelector(".label");
      if (label) label.textContent = "Listening...";
      
      setStatus("I'm listening... 👂", "listening");
      
      startListening(sendToBackend);
    }
  });
}

if (testBtn) {
  testBtn.addEventListener("click", function() {
    sendToBackend("Hello Spidey! Let's chat!");
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", function() {
    const confirmClear = confirm("Start a fresh chat? All your messages will be cleared.");
    
    if (confirmClear) {
      clearConversationStorage();
      stopSpeech();
      hideCaption();
      
      setStatus("Fresh start! What's on your mind? 😊", "ready");
      log("Conversation cleared - Fresh start!");
    }
  });
}

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
    speak("Here's a fun challenge: " + challenge);
  });
}

classButtons.forEach(function(btn) {
  btn.addEventListener("click", function() {
    classButtons.forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    
    if (schoolMode) {
      schoolMode.value = btn.dataset.class;
    }
    
    log("Class level: " + btn.textContent);
  });
});

if (sendBtn) {
  sendBtn.addEventListener("click", function() {
    const text = chatInput && chatInput.value ? chatInput.value.trim() : "";
    if (text) {
      chatInput.value = "";
      sendToBackend(text);
    }
  });
}

if (chatInput) {
  chatInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (sendBtn) sendBtn.click();
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initialize() {
  log("Kids3D Teacher - Replika Mode initialized! 🚀");
  
  // Load saved conversation
  const hasHistory = loadConversationHistory();
  
  if (hasHistory) {
    log("✅ Previous conversation restored!");
    renderSavedConversation();
    setStatus("Hey! I missed you! 😊", "ready");
    
    // Show welcome back message in caption
    if (captionText) {
      captionText.textContent = "Welcome back, friend! Ready to continue?";
    }
  } else {
    setStatus("Hey friend! Ready to chat? 👋", "ready");
    
    if (captionText) {
      captionText.textContent = "Click the big button to start chatting!";
    }
  }
  
  // Set default class
  const defaultClassBtn = document.querySelector('[data-class="class7"]');
  if (defaultClassBtn) {
    defaultClassBtn.classList.add("active");
  }
  
  // Enhanced voice loading for Chrome/Mobile
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