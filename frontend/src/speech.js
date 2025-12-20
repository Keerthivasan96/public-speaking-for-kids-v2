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
// TIMING CONFIG - Balanced for accuracy
// ============================================
const SILENCE_MS = isMobile ? 700 : 600;  // Wait after last word
const MIN_SEND_GAP = 2000;                 // Minimum 2s between sends (prevents double)
const RESTART_DELAY = isMobile ? 400 : 300;

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
    
    // Set silence timer
    if (fullText) {
      silenceTimer = setTimeout(() => {
        finalize(fullText);
      }, SILENCE_MS);
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