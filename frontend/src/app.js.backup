// frontend/src/app.js
// KIDS3D TEACHER - PRODUCTION READY (December 2025)
// Enhanced with Smart Captions, Dynamic Tick System, Word Highlighting
// Fixed: Chrome compatibility, Emoji removal, Better voice selection

import { startListening, stopListening } from "./speech.js";
import { avatarStartTalking, avatarStopTalking } from "./threejs-avatar.js";

const API_URL = "https://public-speaking-for-kids-backend-v2.vercel.app/api/generate";

// DEVICE DETECTION
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// UI ELEMENTS
const micBtn = document.getElementById("micBtn");
const testBtn = document.getElementById("testBtn");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");

const pauseTtsBtn = document.getElementById("pauseTtsBtn");
const resumeTtsBtn = document.getElementById("resumeTtsBtn");
const stopTtsBtn = document.getElementById("stopTtsBtn");

const transcriptBox = document.getElementById("transcript");
const replyBox = document.getElementById("reply");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");

const schoolMode = document.getElementById("schoolMode");
const classButtons = document.querySelectorAll(".class-btn");
const modeToggle = document.getElementById("modeToggle");

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const conversationScroll = document.getElementById("conversationScroll");

const captionBox = document.getElementById("caption-box");
const captionText = document.getElementById("caption-text");
const correctionCardsContainer = document.getElementById("correction-cards");

// STATE MANAGEMENT
let isListening = false;
let isSpeaking = false;
let lastSpokenText = "";
let conversationHistory = [];
let isPracticeMode = false;
let currentUtterance = null;

let captionChunks = [];
let currentChunkIndex = 0;
const CAPTION_CHAR_LIMIT = 150;

// LOGGING UTILITY
function log(msg) {
  if (logEl) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.innerHTML += '<span style="color:#999">[' + timestamp + ']</span> ' + msg + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log("[Kids3D Teacher]", msg);
}

// CAPTION BOX WITH CHUNKING & WORD HIGHLIGHTING
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
      captionText.textContent = "Ready for your next question...";
    }
  }, 400);
}

// SMART TICK SYSTEM
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

// CORRECTION CARD WITH DYNAMIC TICK SYSTEM
function generateCorrectionCard(userText, correctedText, aiResponse) {
  if (!correctionCardsContainer) return;

  const quality = analyzeSentenceQuality(userText, correctedText, aiResponse);
  
  const card = document.createElement("div");
  card.className = "correction-card";

  const themes = {
    'perfect': {
      icon: '\u2705',
      color: '#66bb6a',
      bg: '#e8f5e9',
      label: 'Perfect!',
      showCorrection: false
    },
    'needs-improvement': {
      icon: '\u26A0\uFE0F',
      color: '#ffa726',
      bg: '#fff8e1',
      label: 'Good! Can be better',
      showCorrection: true
    },
    'wrong': {
      icon: '\u274C',
      color: '#ef5350',
      bg: '#ffebee',
      label: "Let's fix this",
      showCorrection: true
    }
  };

  const theme = themes[quality];

  if (!theme.showCorrection) {
    card.innerHTML = '<div class="success-section" style="border-bottom: none; background: ' + theme.bg + '; border: 3px solid ' + theme.color + ';"><div class="icon" style="font-size: 32px;">' + theme.icon + '</div><div class="content"><strong style="color: ' + theme.color + '; font-size: 16px;">' + theme.label + '</strong><div style="margin-top: 10px; font-size: 17px; font-weight: 600;">"' + escapeHtml(userText) + '"</div>' + (aiResponse ? '<div style="margin-top: 12px; font-style: italic; color: #666; font-size: 14px; line-height: 1.5;">' + escapeHtml(aiResponse.substring(0, 100)) + (aiResponse.length > 100 ? '...' : '') + '</div>' : '') + '</div></div>';
  } else {
    card.innerHTML = '<div class="error-section" style="background: ' + theme.bg + '; border-bottom-color: ' + theme.color + '; border-bottom-width: 3px;"><div class="icon" style="font-size: 32px;">' + theme.icon + '</div><div class="content"><strong style="color: ' + theme.color + '; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">You said:</strong><div style="margin-top: 8px; font-size: 16px; font-weight: 600;">"' + escapeHtml(userText) + '"</div></div></div><div class="success-section" style="background: #e8f5e9; border: 3px solid #66bb6a; border-top: none;"><div class="icon" style="font-size: 28px;">\u2705\u2705</div><div class="content"><strong style="color: #66bb6a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Corrected:</strong><div style="margin-top: 8px; font-size: 17px; font-weight: 700; color: #2e7d32;">"' + escapeHtml(correctedText) + '"</div></div></div>';
  }

  correctionCardsContainer.insertBefore(card, correctionCardsContainer.firstChild);

  setTimeout(function() {
    if (conversationScroll) {
      conversationScroll.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, 100);

  log("Card created: " + quality + " - Theme: " + theme.icon);
}

// SMART CORRECTION DETECTION
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

// MARKDOWN RENDERING
function renderReplyMarkdown(md) {
  const html = marked && marked.parse ? marked.parse(md) : md;
  const safe = DOMPurify && DOMPurify.sanitize ? DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }) : html;
  
  if (replyBox) {
    replyBox.innerHTML = safe;
  }

  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function scrollToBottom() {
  if (conversationScroll) {
    conversationScroll.scrollTo({ 
      top: conversationScroll.scrollHeight, 
      behavior: "smooth" 
    });
  }
}

// PROMPT BUILDER
function buildPrompt(userText) {
  const currentClass = schoolMode && schoolMode.value ? schoolMode.value : "class7";

  const modeInstruction = isPracticeMode
    ? "PRACTICE MODE ACTIVE: 1. Praise warmly first 2. If grammar/pronunciation error exists, point it out gently 3. ALWAYS show correct version in quotes: \"correct sentence here\" 4. Be specific about what was wrong 5. Encourage to try again Keep response under 80 words!"
    : "CASUAL CHAT MODE: Be fun, friendly, encouraging! Only mention mistakes if they're major. Keep responses SHORT (40-60 words). Use emojis and be excited!";

  const gradeConfig = {
    class3: "Simple words, lots of excitement! Short responses (30-50 words). Use emojis! Examples: cricket, mangoes, school.",
    class7: "Teen-friendly, clear corrections, relatable. Medium responses (50-80 words). Cool and supportive!",
    class10: "Professional mentor, fluency focus, interview tips. Detailed but concise (60-100 words)."
  };

  const gradeText = gradeConfig[currentClass] || gradeConfig.class7;

  const history = conversationHistory
    .slice(-6)
    .map(function(m) { return (m.role === "user" ? "Student" : "Teacher") + ": " + m.content; })
    .join("\n");

  return "You are an encouraging English teacher for Indian kids.\n\n" + modeInstruction + "\n\nLevel: " + currentClass + "\n" + gradeText + "\n\nRecent conversation:\n" + (history || "(First message)") + "\n\nStudent: \"" + userText + "\"\n\nRespond now! If correcting, put correct sentence in quotes.";
}

// TTS TEXT CLEANUP - ENHANCED (REMOVES ALL EMOJIS)
function cleanTextForSpeech(text) {
  if (!text) return "";
  
  return text
    // Remove ALL emoji ranges
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')  // Symbols & Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')  // Transport & Map
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '')  // Alchemical
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')  // Geometric Shapes
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')  // Supplemental Arrows
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')  // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')  // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')  // Symbols Extended-A
    .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Miscellaneous Symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation Selectors
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')  // Flags
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')  // Skin tones
    .replace(/[\u{200D}]/gu, '')             // Zero-width joiner
    
    // Remove markdown formatting
    .replace(/[*_~`#]/g, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\(([^)]+)\)/g, '')
    
    // Remove special symbols
    .replace(/[•▪▫►▻→↦]/g, '')
    .replace(/[★☆✓✔✗✘]/g, '')
    .replace(/[♠♣♥♦]/g, '')
    
    // Clean quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    
    // Remove excessive punctuation
    .replace(/\.{2,}/g, '.')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// SMART VOICE SELECTION - CROSS-BROWSER & MOBILE
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  
  if (!voices || voices.length === 0) {
    console.warn("No voices available yet");
    return null;
  }

  // Priority 1: Indian English voices
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

  // Priority 2: US/UK English voices
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

  // Priority 3: Any English voice
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

// TTS WITH WORD HIGHLIGHTING - CHROME COMPATIBLE
function speak(text) {
  if (!text || !text.trim()) return;

  stopSpeech();
  
  const cleanedText = cleanTextForSpeech(text);
  lastSpokenText = cleanedText;

  const utter = new SpeechSynthesisUtterance(cleanedText);
  utter.lang = "en-IN";
  
  // Mobile-specific adjustments
  if (isMobileDevice()) {
    utter.rate = 0.9;   // Slightly slower on mobile
    utter.pitch = 1.0;  // Natural pitch on mobile
    utter.volume = 1;
  } else {
    utter.rate = 0.95;
    utter.pitch = 1.25;
    utter.volume = 1;
  }

  // Use smart voice selection
  const bestVoice = selectBestVoice();
  if (bestVoice) utter.voice = bestVoice;

  currentUtterance = utter;
  let wordIndex = 0;
  let highlightInterval = null;

  // Calculate average word duration for fallback highlighting
  const words = cleanedText.split(' ');
  const avgWordDuration = (cleanedText.length / words.length) * 100 / utter.rate;

  utter.onstart = function() {
    isSpeaking = true;
    if (avatarStartTalking) avatarStartTalking();
    showCaption(cleanedText);
    
    if (statusEl) {
      statusEl.textContent = "Teacher is speaking...";
      statusEl.style.color = "#4caf50";
    }
    
    log("Speech started");

    // CHROME FIX: Time-based word highlighting fallback
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

  // Keep boundary event for Edge/Safari (better accuracy when available)
  utter.onboundary = function(event) {
    if (event.name === 'word' && highlightInterval) {
      // If boundary events work, clear the fallback interval
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
    currentUtterance = null;
    
    if (statusEl) {
      statusEl.textContent = "Your turn!";
      statusEl.style.color = "#ff3333";
    }
    
    log("Speech ended");
  };

  utter.onerror = function(event) {
    console.error("Speech error:", event);
    if (highlightInterval) clearInterval(highlightInterval);
    
    isSpeaking = false;
    if (avatarStopTalking) avatarStopTalking();
    hideCaption();
    currentUtterance = null;
    
    if (statusEl) {
      statusEl.textContent = "Error in speech. Try again!";
      statusEl.style.color = "#ff5722";
    }
  };

  window.speechSynthesis.speak(utter);
}

// SPEECH CONTROLS
function stopSpeech() {
  window.speechSynthesis.cancel();
  
  isSpeaking = false;
  if (avatarStopTalking) avatarStopTalking();
  hideCaption();
  currentUtterance = null;
  
  log("Speech stopped");
}

function pauseSpeech() {
  if (isSpeaking) {
    window.speechSynthesis.pause();
    if (avatarStopTalking) avatarStopTalking();
    
    if (statusEl) {
      statusEl.textContent = "Paused";
      statusEl.style.color = "#ff9800";
    }
    
    if (pauseTtsBtn) pauseTtsBtn.style.display = "none";
    if (resumeTtsBtn) resumeTtsBtn.style.display = "flex";
  }
}

function resumeSpeech() {
  window.speechSynthesis.resume();
  if (avatarStartTalking) avatarStartTalking();
  
  if (statusEl) {
    statusEl.textContent = "Teacher is speaking...";
    statusEl.style.color = "#4caf50";
  }
  
  if (pauseTtsBtn) pauseTtsBtn.style.display = "flex";
  if (resumeTtsBtn) resumeTtsBtn.style.display = "none";
}

// BACKEND COMMUNICATION
async function sendToBackend(text) {
  if (!text.trim()) return;

  conversationHistory.push({ role: "user", content: text });
  
  if (transcriptBox) {
    transcriptBox.textContent = text;
    transcriptBox.style.display = "block";
  }

  if (statusEl) {
    statusEl.textContent = "Teacher is thinking...";
    statusEl.style.color = "#2196f3";
  }

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

    const extraction = isPracticeMode ? extractCorrection(text, reply) : { correctedText: text };
    const correctedText = extraction.correctedText;

    generateCorrectionCard(text, correctedText, reply);

    const speakable = renderReplyMarkdown(reply);
    scrollToBottom();
    speak(speakable);

  } catch (err) {
    console.error("Backend error:", err);
    
    if (replyBox) {
      replyBox.innerHTML = '<p style="color:#f44336; padding:20px; background:#ffebee; border-radius:12px;">Connection error. Please check your internet connection.</p>';
    }
    
    if (statusEl) {
      statusEl.textContent = "Connection error";
      statusEl.style.color = "#f44336";
    }
  }
}

// EVENT LISTENERS
if (modeToggle) {
  modeToggle.addEventListener("click", function() {
    isPracticeMode = !isPracticeMode;
    modeToggle.classList.toggle("active", isPracticeMode);
    
    const modeText = isPracticeMode ? "Practice Mode ON!" : "Casual Chat mode!";
    log(modeText);
    
    if (statusEl) {
      statusEl.textContent = modeText;
      statusEl.style.color = isPracticeMode ? "#ff9800" : "#4caf50";
    }
  });
}

if (micBtn) {
  micBtn.addEventListener("click", function() {
    if (isListening) {
      stopListening();
      isListening = false;
      
      micBtn.classList.remove("active");
      const label = micBtn.querySelector(".label");
      if (label) label.textContent = "Speak";
      
      if (statusEl) {
        statusEl.textContent = "Your turn!";
        statusEl.style.color = "#ff3333";
      }
    } else {
      stopSpeech();
      isListening = true;
      
      micBtn.classList.add("active");
      const label = micBtn.querySelector(".label");
      if (label) label.textContent = "Stop";
      
      if (statusEl) {
        statusEl.textContent = "Listening...";
        statusEl.style.color = "#4caf50";
      }
      
      startListening(sendToBackend);
    }
  });
}

if (testBtn) {
  testBtn.addEventListener("click", function() {
    sendToBackend("Hello teacher! Let's practice English together.");
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", function() {
    if (correctionCardsContainer) {
      correctionCardsContainer.innerHTML = "";
    }
    
    if (transcriptBox) transcriptBox.style.display = "none";
    if (replyBox) replyBox.innerHTML = "";
    
    conversationHistory = [];
    stopSpeech();
    hideCaption();
    
    if (statusEl) {
      statusEl.textContent = "New session!";
      statusEl.style.color = "#4caf50";
    }
    
    log("Session cleared");
  });
}

if (demoLessonBtn) {
  demoLessonBtn.addEventListener("click", function() {
    const challenges = [
      "Tell me about your favorite food.",
      "Describe your best friend.",
      "What did you do yesterday?",
      "Where would you like to visit?",
      "What's your favorite subject?"
    ];
    
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    speak("Here's your challenge: " + challenge);
  });
}

if (pauseTtsBtn) {
  pauseTtsBtn.addEventListener("click", pauseSpeech);
}

if (resumeTtsBtn) {
  resumeTtsBtn.addEventListener("click", resumeSpeech);
}

if (stopTtsBtn) {
  stopTtsBtn.addEventListener("click", function() {
    stopSpeech();
    
    if (statusEl) {
      statusEl.textContent = "Your turn!";
      statusEl.style.color = "#ff3333";
    }
    
    if (pauseTtsBtn) pauseTtsBtn.style.display = "flex";
    if (resumeTtsBtn) resumeTtsBtn.style.display = "none";
  });
}

classButtons.forEach(function(btn) {
  btn.addEventListener("click", function() {
    classButtons.forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    
    if (schoolMode) {
      schoolMode.value = btn.dataset.class;
    }
    
    log("Class: " + btn.textContent);
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

// INITIALIZATION
function initialize() {
  log("Kids3D Teacher ready!");
  
  if (statusEl) {
    statusEl.textContent = "Ready!";
    statusEl.style.color = "#4caf50";
  }
  
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
    
    // Chrome requires waiting for voiceschanged event
    window.speechSynthesis.onvoiceschanged = function() {
      voices = window.speechSynthesis.getVoices();
      log(voices.length + " voices loaded");
      
      // Log available English voices for debugging
      voices.forEach(function(voice, i) {
        if (voice.lang.startsWith("en")) {
          console.log(i + ": " + voice.name + " (" + voice.lang + ")");
        }
      });
    };
    
    // Force voice loading on mobile
    if (isMobileDevice()) {
      setTimeout(function() {
        window.speechSynthesis.getVoices();
      }, 100);
    }
  }
  
  setTimeout(function() {
    if (captionText) {
      captionText.textContent = "Click microphone to start!";
    }
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

document.addEventListener("visibilitychange", function() {
  if (document.hidden && isSpeaking) {
    pauseSpeech();
  }
});

window.addEventListener("beforeunload", function() {
  stopSpeech();
  if (isListening) {
    stopListening();
  }
});