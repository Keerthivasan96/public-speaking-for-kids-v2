// ============================================
// speech.js - SMART SPEECH RECOGNITION
// Waits for complete thoughts, quick response
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
// TIMING CONFIG
// ============================================
const CONFIG = {
  baseSilence: isMobile ? 1100 : 900,      // Normal sentences
  shortPhraseSilence: 1400,                 // Short incomplete phrases (wait longer)
  completeSilence: 500,                     // Clearly complete phrases (send fast)
  minSendGap: 2500,                         // Prevent double-sends
  restartDelay: isMobile ? 350 : 250,       // Quick restart
  minWordsForQuick: 4,                      // Need 4+ words for normal timing
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'}`);

/**
 * Calculate smart timeout
 */
function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  const lower = text.toLowerCase().trim();
  
  // Sentence ends with punctuation - complete
  if (['.', '!', '?'].includes(lastChar)) {
    return CONFIG.completeSilence;
  }
  
  // Common complete short phrases
  const completePatterns = [
    /^(yes|no|yeah|yep|nope|okay|ok|sure|thanks|thank you|hi|hello|hey|bye)$/i,
    /^i'?m (good|fine|great|okay|ok|doing good|doing great|doing fine)$/i,
    /^that'?s (good|great|cool|nice|fine|awesome|interesting)$/i,
    /^(good morning|good night|good evening|good afternoon)$/i,
    /^(not really|of course|i think so|i guess|maybe|probably)$/i,
  ];
  
  if (completePatterns.some(p => p.test(lower))) {
    return CONFIG.completeSilence;
  }
  
  // Short phrases that seem INCOMPLETE - wait longer
  // Examples: "my name is", "I want to", "can you"
  if (wordCount < CONFIG.minWordsForQuick) {
    return CONFIG.shortPhraseSilence;
  }
  
  // Normal sentence
  return CONFIG.baseSilence;
}

/**
 * Start listening
 */
export function startListening(onFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported");
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
    console.log("🎤 Listening...");
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
    
    if (final) pendingText += final;
    
    const fullText = (pendingText + interim).trim();
    
    if (interim) console.log("🎤 ...", interim);
    
    if (fullText) {
      const timeout = getTimeout(fullText);
      silenceTimer = setTimeout(() => finalize(fullText), timeout);
    }
  };

  recognition.onerror = (e) => {
    console.log("🎤 Error:", e.error);
    clearTimeout(silenceTimer);
    if (e.error === 'not-allowed') {
      alert("Please allow microphone access.");
    }
  };

  recognition.onend = () => {
    console.log("🎤 Ended");
    isListening = false;
    
    const text = pendingText.trim();
    if (text) {
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
    console.error("Start failed:", e);
  }
}

/**
 * Finalize and send
 */
function finalize(text) {
  if (!text) return;
  
  const now = Date.now();
  if (now - lastSendTime < CONFIG.minSendGap) {
    console.log("⏳ Too soon, skip");
    pendingText = "";
    scheduleRestart();
    return;
  }
  
  console.log("✅ Send:", text);
  lastSendTime = now;
  pendingText = "";
  
  stopRecognition();
  
  if (typeof callback === "function") {
    try {
      callback(text, true);
    } catch (e) {
      console.error("Callback error:", e);
    }
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (continuous && !isSpeaking && !isListening) {
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
  console.log("🛑 Stop");
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