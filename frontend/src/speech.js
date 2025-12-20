// ============================================
// speech.js - SNAPPY SPEECH RECOGNITION
// Smart detection: Fast response without losing words
// ============================================

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;
let silenceTimer = null;
let restartTimer = null;

// Transcript buffers
let interimTranscript = "";
let finalTranscript = "";
let lastInterimTime = 0;
let wordCount = 0;

// Device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);

// ============================================
// SMART TIMING CONFIGURATION
// ============================================
const CONFIG = {
  // Base silence timeout - how long to wait after last word
  baseSilence: isMobile ? 400 : 350,
  
  // Additional time per word (longer sentences get more time)
  perWordBonus: 50,
  
  // Maximum silence timeout
  maxSilence: 1200,
  
  // Minimum silence timeout
  minSilence: 300,
  
  // Quick phrases (1-3 words) finalize faster
  quickPhraseTimeout: 250,
  quickPhraseWords: 3,
  
  // Restart delay after recognition ends
  restartDelay: isMobile ? 200 : 150,
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} | Base: ${CONFIG.baseSilence}ms`);

/**
 * Calculate smart timeout based on what user is saying
 */
function getSmartTimeout(transcript) {
  const words = transcript.trim().split(/\s+/).filter(w => w.length > 0);
  wordCount = words.length;
  
  // Quick phrases (1-3 words like "yes", "hello", "I'm good") - very fast
  if (wordCount <= CONFIG.quickPhraseWords) {
    return CONFIG.quickPhraseTimeout;
  }
  
  // Longer sentences - give more time but cap it
  const calculatedTime = CONFIG.baseSilence + (wordCount * CONFIG.perWordBonus);
  return Math.min(Math.max(calculatedTime, CONFIG.minSilence), CONFIG.maxSilence);
}

/**
 * Start listening - SNAPPY VERSION
 */
export function startListening(onTextFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported");
    return;
  }

  // Don't start if speaking
  if (isSpeaking) {
    console.log("❌ Blocked: TTS speaking");
    _onFinal = onTextFinal;
    _continuous = !!options.continuous;
    return;
  }

  _onFinal = onTextFinal;
  _continuous = !!options.continuous;

  // Already listening? Just update callback
  if (recognition && _isListening) {
    return;
  }

  // Clean up
  cleanup();
  interimTranscript = "";
  finalTranscript = "";
  wordCount = 0;
  lastInterimTime = Date.now();

  // Create recognition
  recognition = new SpeechRecognition();
  recognition.continuous = !isMobile;  // Mobile: false for reliability
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = options.lang || "en-US";

  recognition.onstart = () => {
    console.log("🎤 Started");
    _isListening = true;
    lastInterimTime = Date.now();
  };

  recognition.onresult = (event) => {
    clearTimeout(silenceTimer);
    lastInterimTime = Date.now();
    
    let currentInterim = "";
    let currentFinal = "";
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        currentFinal += transcript + " ";
        console.log("🎤 Final chunk:", transcript);
      } else {
        currentInterim += transcript;
      }
    }
    
    if (currentFinal) {
      finalTranscript += currentFinal;
    }
    interimTranscript = currentInterim;
    
    // Log interim for debugging
    if (currentInterim) {
      console.log("🎤 Interim:", currentInterim);
    }
    
    // Calculate smart timeout based on content
    const fullText = (finalTranscript + interimTranscript).trim();
    const timeout = getSmartTimeout(fullText);
    
    // Set timer to finalize
    silenceTimer = setTimeout(() => {
      finalizeSpeech();
    }, timeout);
  };

  recognition.onerror = (e) => {
    console.error("🎤 Error:", e.error);
    clearTimeout(silenceTimer);
    
    if (e.error === 'not-allowed') {
      alert("Please allow microphone access.");
    }
    
    // On no-speech, just restart quietly
    if (e.error === 'no-speech' && _continuous && !isSpeaking) {
      scheduleRestart();
    }
  };

  recognition.onend = () => {
    console.log("🎤 Ended");
    _isListening = false;
    
    // Check if we have pending speech to finalize
    const pending = (finalTranscript + interimTranscript).trim();
    if (pending) {
      clearTimeout(silenceTimer);
      finalizeSpeech();
      return;
    }
    
    // Auto-restart if continuous
    if (_continuous && !isSpeaking) {
      scheduleRestart();
    }
  };

  // Start
  try {
    recognition.start();
    console.log("🎤 Recognition started");
  } catch (e) {
    console.error("Start failed:", e);
    if (isMobile) {
      setTimeout(() => {
        try { recognition?.start(); } catch(e2) {}
      }, 300);
    }
  }
}

/**
 * Finalize speech and call callback
 */
function finalizeSpeech() {
  const fullText = (finalTranscript + interimTranscript).trim();
  
  if (!fullText) {
    // No text, just restart if continuous
    if (_continuous && !isSpeaking) {
      scheduleRestart();
    }
    return;
  }
  
  console.log(`✅ Complete (${wordCount} words): "${fullText}"`);
  
  // Clear buffers
  finalTranscript = "";
  interimTranscript = "";
  wordCount = 0;
  
  // Stop recognition
  stopRecognition();
  
  // Call callback
  if (typeof _onFinal === "function") {
    try {
      _onFinal(fullText, true);
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
    if (_continuous && !isSpeaking && !_isListening) {
      console.log("🔄 Restarting...");
      startListening(_onFinal, { continuous: true, interimResults: true });
    }
  }, CONFIG.restartDelay);
}

/**
 * Stop recognition only (not continuous mode)
 */
function stopRecognition() {
  clearTimeout(silenceTimer);
  
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch(e) {}
  }
  _isListening = false;
}

/**
 * Stop listening completely
 */
export function stopListening() {
  console.log("🛑 Stopping...");
  
  _continuous = false;
  _onFinal = null;
  _isListening = false;
  
  cleanup();
  
  finalTranscript = "";
  interimTranscript = "";
  wordCount = 0;
}

/**
 * Cleanup
 */
function cleanup() {
  clearTimeout(silenceTimer);
  clearTimeout(restartTimer);
  
  if (recognition) {
    try { recognition.onend = null; } catch(_) {}
    try { recognition.onerror = null; } catch(_) {}
    try { recognition.onresult = null; } catch(_) {}
    try { recognition.stop(); } catch(_) {}
    recognition = null;
  }
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

/**
 * Speak text
 */
export function speakText(text) {
  if (!text) return;
  
  stopSpeaking();
  
  if (!window.speechSynthesis) {
    console.warn("TTS not available");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = isMobile ? 0.92 : 0.95;
  utterance.pitch = isMobile ? 1.12 : 1.18;
  utterance.volume = 1.0;

  isSpeaking = true;

  utterance.onstart = () => {
    console.log("🔊 Speaking...");
    isSpeaking = true;
  };

  utterance.onend = () => {
    console.log("🔊 Done");
    isSpeaking = false;
    
    // Restart listening if continuous
    if (_continuous && _onFinal) {
      const delay = isMobile ? 600 : 400;
      setTimeout(() => {
        if (!isSpeaking && _continuous) {
          startListening(_onFinal, { continuous: true });
        }
      }, delay);
    }
  };

  utterance.onerror = (e) => {
    console.error("🔊 Error:", e);
    isSpeaking = false;
  };

  // Speak
  try {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, isMobile ? 80 : 50);
  } catch (e) {
    console.error("Speak error:", e);
    isSpeaking = false;
  }
}

// ============================================
// EXPORTS
// ============================================
if (typeof window !== "undefined") {
  window.speakText = speakText;
  window.stopSpeaking = stopSpeaking;
  window.startListening = startListening;
  window.stopListening = stopListening;
  
  window.__speechConfig = CONFIG;
}

export default {
  startListening,
  stopListening,
  stopSpeaking,
  speakText
};