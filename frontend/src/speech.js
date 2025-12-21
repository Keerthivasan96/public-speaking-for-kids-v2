// ============================================
// speech.js - OPTIMIZED SPEECH RECOGNITION
// Fast, accurate, complete thoughts
// ============================================

let recognition = null;
let callback = null;
let continuous = false;
let isListening = false;
let isSpeaking = false;

let silenceTimer = null;
let restartTimer = null;
let pendingText = "";
let lastSendTime = 0;

// Device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ============================================
// OPTIMIZED TIMING - FASTER & SMARTER
// ============================================
const CONFIG = {
  // MUCH FASTER base timing
  baseSilence: isMobile ? 700 : 600,           // Normal sentences (was 900-1100)
  shortPhraseSilence: 950,                     // Short phrases (was 1400)
  completeSilence: 400,                        // Complete phrases (was 500)
  
  minSendGap: 2000,                            // Prevent double-sends
  restartDelay: isMobile ? 300 : 200,          // Quick restart
  minWordsForQuick: 3,                         // Lower threshold (was 4)
};

console.log(`🎤 Speech optimized: ${isMobile ? 'Mobile' : 'Desktop'} mode`);

/**
 * SMARTER timeout detection
 */
function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  const lower = text.toLowerCase().trim();
  
  // Clear sentence ending with punctuation - SEND FAST
  if (['.', '!', '?'].includes(lastChar)) {
    console.log(`⚡ Complete sentence (${wordCount} words) - quick send`);
    return CONFIG.completeSilence;
  }
  
  // Question detected - likely complete
  if (lower.includes('?') || lower.startsWith('what') || lower.startsWith('how') || 
      lower.startsWith('why') || lower.startsWith('when') || lower.startsWith('where') ||
      lower.startsWith('who') || lower.startsWith('can you') || lower.startsWith('do you')) {
    console.log(`❓ Question detected (${wordCount} words) - quick send`);
    return CONFIG.completeSilence;
  }
  
  // Common complete short phrases - SEND IMMEDIATELY
  const quickPhrases = [
    /^(yes|no|yeah|yep|nope|okay|ok|sure|thanks|thank you|hi|hello|hey|bye)$/i,
    /^i'?m (good|fine|great|okay|ok|doing good|doing great|doing fine|happy|sad|tired)$/i,
    /^that'?s (good|great|cool|nice|fine|awesome|interesting|funny|sad|bad)$/i,
    /^(good morning|good night|good evening|good afternoon)$/i,
    /^(not really|of course|i think so|i guess|maybe|probably|definitely)$/i,
    /^(sounds good|sounds great|sounds fun|sounds interesting)$/i,
    /^(i see|i understand|i get it|makes sense)$/i,
  ];
  
  if (quickPhrases.some(p => p.test(lower))) {
    console.log(`✅ Quick phrase detected - immediate send`);
    return CONFIG.completeSilence;
  }
  
  // Longer statements (5+ words) - likely complete
  if (wordCount >= 5) {
    // Check for natural endings
    const endings = ['too', 'though', 'actually', 'really', 'today', 'yesterday', 'tomorrow'];
    const lastWord = words[words.length - 1].toLowerCase();
    
    if (endings.includes(lastWord)) {
      console.log(`🎯 Natural ending detected (${wordCount} words) - quick send`);
      return CONFIG.baseSilence - 150; // Even faster for natural endings
    }
    
    console.log(`📝 Normal sentence (${wordCount} words) - standard timing`);
    return CONFIG.baseSilence;
  }
  
  // Short incomplete phrases (1-4 words without clear ending) - wait a bit
  if (wordCount < CONFIG.minWordsForQuick) {
    console.log(`⏳ Short phrase (${wordCount} words) - waiting for more`);
    return CONFIG.shortPhraseSilence;
  }
  
  // Default
  return CONFIG.baseSilence;
}

/**
 * Start listening
 */
export function startListening(onFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("❌ Speech Recognition not supported");
    return;
  }

  if (isSpeaking) {
    callback = onFinal;
    continuous = !!options.continuous;
    return;
  }

  callback = onFinal;
  continuous = !!options.continuous;

  if (recognition && isListening) return;

  cleanup();
  pendingText = "";

  recognition = new SpeechRecognition();
  recognition.continuous = !isMobile;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = options.lang || "en-US";

  recognition.onstart = () => {
    console.log("🎤 Recognition STARTED");
    isListening = true;
  };

  recognition.onresult = (event) => {
    clearTimeout(silenceTimer);
    
    let interim = "";
    let final = "";
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += text + " ";
      } else {
        interim += text;
      }
    }
    
    if (final) {
      pendingText += final;
      console.log("🎤 Final chunk:", final.trim());
    }
    
    const fullText = (pendingText + interim).trim();
    
    if (interim && interim.length > 3) {
      console.log("🎤 Interim:", interim.substring(0, 40) + "...");
    }
    
    if (fullText) {
      const timeout = getTimeout(fullText);
      silenceTimer = setTimeout(() => finalize(fullText), timeout);
    }
  };

  recognition.onerror = (e) => {
    console.log("❌ Speech error:", e.error);
    clearTimeout(silenceTimer);
    
    if (e.error === 'not-allowed') {
      alert("❗ Please allow microphone access in your browser settings.");
    }
    
    if (e.error === 'no-speech') {
      console.log("🔇 No speech detected");
      if (continuous) scheduleRestart();
    }
  };

  recognition.onend = () => {
    console.log("🛑 Recognition ENDED");
    isListening = false;
    
    const text = pendingText.trim();
    if (text && text.length > 0) {
      clearTimeout(silenceTimer);
      finalize(text);
      return;
    }
    
    if (continuous && !isSpeaking) {
      scheduleRestart();
    }
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("❌ Start failed:", e);
  }
}

/**
 * Finalize and send
 */
function finalize(text) {
  if (!text || text.trim().length === 0) return;
  
  const now = Date.now();
  if (now - lastSendTime < CONFIG.minSendGap) {
    console.log("⏳ Too soon since last send, skipping");
    pendingText = "";
    scheduleRestart();
    return;
  }
  
  console.log("✅ Complete text:", text);
  console.log(`📤 Sending (${text.split(/\s+/).length} words)`);
  
  lastSendTime = now;
  pendingText = "";
  
  stopRecognition();
  
  if (typeof callback === "function") {
    try {
      callback(text, true);
    } catch (e) {
      console.error("❌ Callback error:", e);
    }
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (continuous && !isSpeaking && !isListening) {
      console.log("🔄 Auto-restarting...");
      startListening(callback, { continuous: true });
    }
  }, CONFIG.restartDelay);
}

function stopRecognition() {
  clearTimeout(silenceTimer);
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch (e) {}
  }
  isListening = false;
}

export function stopListening() {
  console.log("🛑 STOP listening");
  continuous = false;
  callback = null;
  isListening = false;
  pendingText = "";
  cleanup();
}

function cleanup() {
  clearTimeout(silenceTimer);
  clearTimeout(restartTimer);
  if (recognition) {
    try { recognition.onend = null; } catch (e) {}
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
}

export function setSpeaking(speaking) {
  isSpeaking = speaking;
  console.log(`🔊 Speaking: ${speaking}`);
}

export function stopSpeaking() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  isSpeaking = false;
}

if (typeof window !== "undefined") {
  window.startListening = startListening;
  window.stopListening = stopListening;
  window.stopSpeaking = stopSpeaking;
}

export default { startListening, stopListening, stopSpeaking, setSpeaking };