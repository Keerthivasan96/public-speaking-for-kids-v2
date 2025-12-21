// ============================================
// speech.js - CLEAN SPEECH RECOGNITION
// Prevents double-sends, smooth timing
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
// TIMING CONFIG - Replika-style (wait for complete thoughts)
// ============================================
const BASE_SILENCE_MS = isMobile ? 1200 : 1000;  // Base wait time
const SHORT_PHRASE_SILENCE = 1500;                // Extra time for short phrases (1-3 words)
const SENTENCE_END_SILENCE = 600;                 // Faster if sentence seems complete
const MIN_SEND_GAP = 2500;                        // Minimum 2.5s between sends
const RESTART_DELAY = isMobile ? 400 : 300;
const MIN_WORDS_QUICK = 4;                        // Need 4+ words for normal timing

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} | Silence: ${SILENCE_MS}ms`);

/**
 * Start listening
 */
export function startListening(onFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported");
    return;
  }

  // Don't start if speaking
  if (isSpeaking) {
    callback = onFinal;
    continuous = !!options.continuous;
    return;
  }

  callback = onFinal;
  continuous = !!options.continuous;

  // Already listening
  if (recognition && isListening) return;

  // Clean up
  cleanup();
  pendingText = "";

  // Create recognition
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
    
    // Build full pending text
    if (final) {
      pendingText += final;
    }
    
    const fullText = (pendingText + interim).trim();
    
    if (interim) {
      console.log("🎤 ...", interim);
    }
    
    // SMART TIMEOUT CALCULATION
    if (fullText) {
      const timeout = calculateSmartTimeout(fullText);
      silenceTimer = setTimeout(() => {
        finalize(fullText);
      }, timeout);
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
    
    // Finalize any pending text
    const text = pendingText.trim();
    if (text) {
      clearTimeout(silenceTimer);
      finalize(text);
      return;
    }
    
    // Auto-restart if continuous
    if (continuous && !isSpeaking) {
      scheduleRestart();
    }
  };

  // Start
  try {
    recognition.start();
  } catch (e) {
    console.error("Start failed:", e);
  }
}

/**
 * Calculate smart timeout based on what user said
 */
function calculateSmartTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  
  // Check if sentence seems complete (ends with punctuation)
  const seemsComplete = ['.', '!', '?'].includes(lastChar);
  
  // Check for common complete phrases
  const lowerText = text.toLowerCase().trim();
  const completePatterns = [
    /^(yes|no|yeah|yep|nope|okay|ok|sure|thanks|thank you|hello|hi|hey|bye|goodbye)$/,
    /^i'?m\s+(good|fine|great|okay|ok)$/,
    /^that'?s\s+(good|great|fine|cool|nice|interesting)$/,
  ];
  const isCompletePhrase = completePatterns.some(p => p.test(lowerText));
  
  // If clearly complete, send faster
  if (seemsComplete || isCompletePhrase) {
    console.log("🎤 [Seems complete, using short timeout]");
    return SENTENCE_END_SILENCE;
  }
  
  // Short phrases (1-3 words) that DON'T seem complete - wait longer
  // This prevents "my name is" from sending before "my name is Keerthi"
  if (wordCount < MIN_WORDS_QUICK) {
    console.log(`🎤 [Short phrase: ${wordCount} words, waiting longer]`);
    return SHORT_PHRASE_SILENCE;
  }
  
  // Normal sentences - base timeout
  return BASE_SILENCE_MS;
}
/**
 * Finalize and send text
 */
function finalize(text) {
  if (!text) return;
  
  // PREVENT DOUBLE SENDS
  const now = Date.now();
  if (now - lastSendTime < MIN_SEND_GAP) {
    console.log("⏳ Too soon, skipping duplicate");
    pendingText = "";
    scheduleRestart();
    return;
  }
  
  console.log("✅ Sending:", text);
  lastSendTime = now;
  pendingText = "";
  
  // Stop recognition
  stopRecognition();
  
  // Call callback
  if (typeof callback === "function") {
    try {
      callback(text, true);
    } catch (e) {
      console.error("Callback error:", e);
    }
  }
}

/**
 * Schedule restart
 */
function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (continuous && !isSpeaking && !isListening) {
      startListening(callback, { continuous: true });
    }
  }, RESTART_DELAY);
}

/**
 * Stop recognition only
 */
function stopRecognition() {
  clearTimeout(silenceTimer);
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch(e) {}
  }
  isListening = false;
}

/**
 * Stop listening completely
 */
export function stopListening() {
  console.log("🛑 Stopping...");
  continuous = false;
  callback = null;
  isListening = false;
  pendingText = "";
  cleanup();
}

/**
 * Cleanup
 */
function cleanup() {
  clearTimeout(silenceTimer);
  clearTimeout(restartTimer);
  if (recognition) {
    try { recognition.onend = null; } catch(_) {}
    try { recognition.stop(); } catch(_) {}
    recognition = null;
  }
}

/**
 * Mark speaking state (called from app.js)
 */
export function setSpeaking(speaking) {
  isSpeaking = speaking;
}

/**
 * Stop speaking
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch(_) {}
  }
  isSpeaking = false;
}

// Global access
if (typeof window !== "undefined") {
  window.startListening = startListening;
  window.stopListening = stopListening;
  window.stopSpeaking = stopSpeaking;
}

export default { startListening, stopListening, stopSpeaking, setSpeaking };