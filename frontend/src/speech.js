// frontend/src/speech.js
// MOBILE-OPTIMIZED Speech Recognition + TTS
// Fixes issues with mobile browsers (Android/iOS)

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;
let recognitionRestartTimer = null;
let silenceTimer = null;
let interimTranscript = "";
let finalTranscript = "";

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);

// MOBILE FIX: Shorter timeout for mobile (they're more sensitive)
const SILENCE_TIMEOUT = isMobile ? 600 : 801; // Mobile: 1.2s, Desktop: 1.8s

console.log(`Device: ${isMobile ? 'Mobile' : 'Desktop'} (iOS: ${isIOS}, Android: ${isAndroid})`);

/**
 * Start listening - MOBILE OPTIMIZED
 */
export function startListening(onTextFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported");
    alert("Your browser doesn't support speech recognition. Please use Chrome or Safari.");
    return;
  }

  // MOBILE FIX: Don't start if TTS is speaking
  if (isSpeaking) {
    console.log("❌ Recognition blocked: TTS speaking");
    if (options.continuous) {
      _onFinal = onTextFinal;
      _continuous = true;
    }
    return;
  }

  _onFinal = onTextFinal;
  _continuous = !!options.continuous;

  // If already listening, just update callback
  if (recognition && _isListening) {
    console.log("⚠️ Already listening - updating callback");
    return;
  }

  // Clean up existing
  cleanup();

  interimTranscript = "";
  finalTranscript = "";

  // Create recognition
  recognition = new SpeechRecognition();
  
  // MOBILE FIX: Different settings for mobile vs desktop
  if (isMobile) {
    recognition.continuous = false;  // Mobile works better with false
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
  } else {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
  }
  
  recognition.lang = options.lang || "en-IN";

  recognition.onstart = () => {
    console.log("🎤 Recognition STARTED");
    _isListening = true;
    document.dispatchEvent(new CustomEvent("speechRecognitionStarted"));
  };

  recognition.onresult = (event) => {
  clearTimeout(silenceTimer);
  interimTranscript = "";

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;

    if (event.results[i].isFinal) {
      finalTranscript += transcript + " ";
      console.log("🎤 Final:", transcript);

      // ⚡ IMMEDIATE FINALIZE
      const fullText = (finalTranscript + interimTranscript).trim();

      if (fullText && typeof _onFinal === "function") {
        console.log("⚡ Immediate Complete:", fullText);
        try {
          _onFinal(fullText, true);
        } catch (e) {
          console.error("Callback error:", e);
        }
      }

      // Reset buffers
      finalTranscript = "";
      interimTranscript = "";

      stopListening();
      return; // EXIT onresult
    } else {
      interimTranscript = transcript;
      console.log("🎤 Interim:", transcript);
    }
  } // ✅ FOR LOOP CLOSED HERE

  // ⏱️ FALLBACK SILENCE FINALIZE (only if no final result)
  const timeout = isMobile ? 500 : SILENCE_TIMEOUT;

  silenceTimer = setTimeout(() => {
    const fullText = (finalTranscript + interimTranscript).trim();

    if (fullText && typeof _onFinal === "function") {
      console.log("✅ Complete (timeout):", fullText);
      try {
        _onFinal(fullText, true);
      } catch (e) {
        console.error("Callback error:", e);
      }

      finalTranscript = "";
      interimTranscript = "";
      stopListening();
    }
  }, timeout);
};


    // MOBILE FIX: On mobile, finalize faster
    const timeout = isMobile ? 800 : SILENCE_TIMEOUT;
    
    silenceTimer = setTimeout(() => {
      const fullText = (finalTranscript + interimTranscript).trim();
      
      if (fullText && typeof _onFinal === "function") {
        console.log("✅ Complete:", fullText);
        
        try {
          _onFinal(fullText, true);
        } catch (e) {
          console.error("Callback error:", e);
        }
        
        finalTranscript = "";
        interimTranscript = "";
        
        // MOBILE FIX: Stop and let app restart if needed
        stopListening();
      }
    }, timeout);
  };

  recognition.onerror = (e) => {
    console.error("🎤 ERROR:", e.error, e);
    clearTimeout(silenceTimer);
    
    // MOBILE FIX: Handle specific mobile errors
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alert("Please allow microphone access in your browser settings.");
    } else if (e.error === 'no-speech') {
      console.log("No speech detected, restarting...");
    } else if (e.error === 'network') {
      console.error("Network error - check internet connection");
    }
    
    document.dispatchEvent(new CustomEvent("speechRecognitionError", { detail: e }));
  };

  recognition.onend = () => {
    console.log("🎤 Recognition ENDED");
    _isListening = false;
    clearTimeout(silenceTimer);
    document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));

    // MOBILE FIX: More reliable restart logic
    if (_continuous && !isSpeaking) {
      const restartDelay = isMobile ? 300 : 500;
      
      recognitionRestartTimer = setTimeout(() => {
        if (_continuous && !isSpeaking) {
          console.log("🔄 Auto-restarting...");
          
          try {
            if (recognition) {
              recognition.start();
            } else {
              // Recreate if needed
              startListening(_onFinal, { 
                continuous: true, 
                lang: options.lang,
                interimResults: true
              });
            }
          } catch (e) {
            console.warn("Restart failed:", e.message);
            
            // MOBILE FIX: Wait longer and try full recreation
            if (_continuous && !isSpeaking) {
              setTimeout(() => {
                startListening(_onFinal, { 
                  continuous: true, 
                  lang: options.lang,
                  interimResults: true
                });
              }, 1000);
            }
          }
        }
      }, restartDelay);
    }
  };

  // MOBILE FIX: Try-catch for mobile quirks
  try {
    recognition.start();
    console.log(`🎤 Started (${isMobile ? 'Mobile' : 'Desktop'} mode)`);
  } catch (e) {
    console.error("Failed to start:", e);
    
    // MOBILE FIX: Sometimes mobile needs a moment
    if (isMobile) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e2) {
          console.error("Second start attempt failed:", e2);
        }
      }, 500);
    }
  }

/**
 * Stop listening - CLEAN
 */
export function stopListening() {
  console.log("🛑 Stopping recognition...");
  
  _continuous = false;
  _onFinal = null;
  _isListening = false;

  cleanup();

  interimTranscript = "";
  finalTranscript = "";

  document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));
}

/**
 * Cleanup helper
 */
function cleanup() {
  clearTimeout(recognitionRestartTimer);
  clearTimeout(silenceTimer);

  if (recognition) {
    try { recognition.onend = null; } catch (_) {}
    try { recognition.onerror = null; } catch (_) {}
    try { recognition.onresult = null; } catch (_) {}
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
}

/**
 * Stop TTS
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    try { 
      window.speechSynthesis.cancel(); 
    } catch (_) {}
  }
  isSpeaking = false;
  document.dispatchEvent(new CustomEvent("avatarTalkStop"));
}

/**
 * Speak - MOBILE OPTIMIZED
 */
export function speakText(text) {
  if (!text) return;

  stopSpeaking();

  if (!("speechSynthesis" in window)) {
    console.warn("TTS not available");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // MOBILE FIX: Different settings for mobile
  if (isMobile) {
    utterance.lang = "en-US";  // Mobile works better with en-US
    utterance.rate = 0.90;
    utterance.pitch = 1.15;
    utterance.volume = 1.0;
  } else {
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1.22;
    utterance.volume = 1.0;
  }

  // MOBILE FIX: Wait for voices to load on iOS
  if (isIOS) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      console.log("⏳ Waiting for iOS voices...");
      window.speechSynthesis.onvoiceschanged = () => {
        const v = window.speechSynthesis.getVoices();
        console.log(`✓ ${v.length} voices loaded`);
      };
    }
  }

  isSpeaking = true;
  document.dispatchEvent(new CustomEvent("avatarTalkStart"));

  utterance.onstart = () => {
    console.log("🔊 TTS started");
    isSpeaking = true;
  };

  utterance.onend = () => {
    console.log("🔇 TTS ended");
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
    
    // MOBILE FIX: Give mobile more time before restarting recognition
    if (_continuous && _onFinal) {
      const delay = isMobile ? 1000 : 800;
      
      setTimeout(() => {
        if (!isSpeaking && _continuous) {
          console.log("🔄 Restarting recognition after TTS");
          startListening(_onFinal, { continuous: true, interimResults: true });
        }
      }, delay);
    }
  };

  utterance.onerror = (e) => {
    console.error("🔊 TTS error:", e);
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  };

  try {
    // MOBILE FIX: Cancel any pending speech first
    window.speechSynthesis.cancel();
    
    // MOBILE FIX: Small delay for mobile
    if (isMobile) {
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 100);
    } else {
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.error("Speech error:", e);
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  }
}

// Global access
if (typeof window !== "undefined") {
  window.speakText = speakText;
  window.stopSpeaking = stopSpeaking;
  window.startListening = startListening;
  window.stopListening = stopListening;
  
  // Expose mobile detection for debugging
  window.__speechDebug = {
    isMobile,
    isIOS,
    isAndroid,
    silenceTimeout: SILENCE_TIMEOUT
  };
}

export default {
  startListening,
  stopListening,
  stopSpeaking,
  speakText
};