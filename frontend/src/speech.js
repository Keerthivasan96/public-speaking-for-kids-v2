// ============================================
// speech.js - FIXED SPEECH RECOGNITION
// PREVENTS cutting off mid-sentence
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
let interimBuffer = "";

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ============================================
// BALANCED TIMING - Not too fast, not too slow
// ============================================
const CONFIG = {
  baseSilence: isMobile ? 900 : 800,           // Normal sentences
  shortPhraseSilence: 1200,                    // Wait longer for incomplete
  completeSilence: 500,                        // Quick send for complete
  
  minSendGap: 2000,
  restartDelay: isMobile ? 300 : 250,
  minWordsForNormal: 5,                        // Need 5+ words for normal timing
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} mode`);

/**
 * SMARTER detection - prevents cut-offs
 */
function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  const lower = text.toLowerCase().trim();
  
  // Clear sentence ending - SEND
  if (['.', '!', '?'].includes(lastChar)) {
    console.log(`✅ Complete sentence (${wordCount} words)`);
    return CONFIG.completeSilence;
  }
  
  // One-word quick responses ONLY if they're complete phrases
  if (wordCount === 1) {
    const oneWordComplete = /^(yes|no|yeah|yep|nope|ok|okay|sure|hi|hey|hello|bye)$/i;
    if (oneWordComplete.test(lower)) {
      console.log(`✅ Quick one-word response`);
      return CONFIG.completeSilence;
    }
    // Otherwise wait longer - probably incomplete
    console.log(`⏳ Single word - waiting for more`);
    return CONFIG.shortPhraseSilence;
  }
  
  // Two-word phrases - be CAUTIOUS
  if (wordCount === 2) {
    const twoWordComplete = /^(good morning|good night|thank you|sounds good|not really|i see|makes sense|of course)$/i;
    if (twoWordComplete.test(lower)) {
      console.log(`✅ Complete two-word phrase`);
      return CONFIG.completeSilence;
    }
    // Likely incomplete - wait longer
    console.log(`⏳ Two words - likely incomplete, waiting`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 3-4 words - CHECK if it's a complete phrase
  if (wordCount <= 4) {
    const shortComplete = /^(i'?m (good|fine|great|okay|tired|happy|sad)|that'?s (good|great|cool|nice|awesome)|sounds (good|great|fun))$/i;
    if (shortComplete.test(lower)) {
      console.log(`✅ Complete short phrase (${wordCount} words)`);
      return CONFIG.baseSilence;
    }
    
    // Check for question starters that need more
    const incompleteStarters = /^(can you|do you|would you|could you|what|how|why|when|where|i want|i need)/i;
    if (incompleteStarters.test(lower)) {
      console.log(`⏳ Incomplete question/statement (${wordCount} words) - waiting`);
      return CONFIG.shortPhraseSilence;
    }
    
    console.log(`⏳ Short phrase (${wordCount} words) - waiting for more`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 5+ words - likely complete, use normal timing
  console.log(`📝 Normal sentence (${wordCount} words)`);
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
  interimBuffer = "";

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
    
    if (final) {
      pendingText += final;
      console.log("🎤 Final:", final.trim());
    }
    
    const fullText = (pendingText + interim).trim();
    interimBuffer = interim;
    
    if (interim && interim.length > 2) {
      console.log("🎤 ...", interim.substring(0, 50));
    }
    
    if (fullText) {
      const timeout = getTimeout(fullText);
      silenceTimer = setTimeout(() => finalize(fullText), timeout);
    }
  };

  recognition.onerror = (e) => {
    console.log("❌ Error:", e.error);
    clearTimeout(silenceTimer);
    
    if (e.error === 'not-allowed') {
      alert("Please allow microphone access");
    }
    
    if (e.error === 'no-speech') {
      console.log("🔇 No speech");
      if (continuous) scheduleRestart();
    }
  };

  recognition.onend = () => {
    console.log("🛑 Recognition ended");
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
    console.log("⏳ Too soon, skipping");
    pendingText = "";
    interimBuffer = "";
    scheduleRestart();
    return;
  }
  
  const words = text.split(/\s+/).length;
  console.log(`✅ SENDING: "${text}" (${words} words)`);
  
  lastSendTime = now;
  pendingText = "";
  interimBuffer = "";
  
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
      console.log("🔄 Restarting...");
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
  console.log("🛑 STOP");
  continuous = false;
  callback = null;
  isListening = false;
  pendingText = "";
  interimBuffer = "";
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