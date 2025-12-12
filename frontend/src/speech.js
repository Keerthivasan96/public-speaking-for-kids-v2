// frontend/src/speech.js
// Improved SpeechRecognition + TTS with proper coordination

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;
let recognitionRestartTimer = null;

/**
 * Start listening for speech.
 * Will NOT start if TTS is currently speaking.
 */
export function startListening(onTextFinal, options = { continuous: false, lang: "en-IN" }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Your browser does not support SpeechRecognition.");
    return;
  }

  // CRITICAL: Do NOT start recognition while TTS is speaking
  if (isSpeaking) {
    console.log("startListening blocked: TTS is speaking");
    
    // Queue for later if continuous mode
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
    console.log("startListening: already active – updating callback");
    return;
  }

  // Clean up any existing instance
  try {
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch (_) {}
      recognition = null;
    }
  } catch (_) {}

  // Clear any pending restart timers
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }

  // Create new recognition instance
  recognition = new SpeechRecognition();
  recognition.lang = options.lang || "en-IN";
  recognition.continuous = false; // We handle continuity manually
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("🎤 SpeechRecognition started");
    _isListening = true;
    document.dispatchEvent(new CustomEvent("speechRecognitionStarted"));
  };

  recognition.onresult = (event) => {
    const text = event?.results?.[0]?.[0]?.transcript || "";
    console.log("🎤 Recognized:", text);
    
    if (typeof _onFinal === "function" && text.trim()) {
      try { 
        _onFinal(text.trim()); 
      } catch (e) {
        console.error("Error in recognition callback:", e);
      }
    }
  };

  recognition.onerror = (e) => {
    console.warn("SpeechRecognition error:", e.error);
    
    // Don't restart on certain errors
    if (e.error === 'aborted' || e.error === 'no-speech') {
      document.dispatchEvent(new CustomEvent("speechRecognitionError", { detail: e }));
    }
  };

  recognition.onend = () => {
    console.log("🎤 SpeechRecognition ended");
    _isListening = false;
    document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));

    // Restart logic for continuous mode
    if (_continuous && !isSpeaking) {
      // Add delay before restarting to prevent rapid cycling
      recognitionRestartTimer = setTimeout(() => {
        try {
          if (_continuous && !isSpeaking && recognition) {
            console.log("🔄 Restarting recognition (continuous mode)");
            recognition.start();
          }
        } catch (e) {
          console.warn("Failed to restart recognition:", e);
          
          // If restart fails, try recreating the instance
          if (_continuous && !isSpeaking) {
            setTimeout(() => {
              startListening(_onFinal, { continuous: true, lang: options.lang });
            }, 1000);
          }
        }
      }, 500); // 500ms delay between recognition cycles
    }
  };

  try { 
    recognition.start(); 
    console.log("🎤 Recognition started");
  } catch (e) {
    console.error("Failed to start recognition:", e);
  }
}

/**
 * Stop listening and prevent auto restart.
 */
export function stopListening() {
  _continuous = false;
  _onFinal = null;
  _isListening = false;

  // Clear restart timer
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }

  if (recognition) {
    try { recognition.onend = null; } catch (_) {}
    try { recognition.onerror = null; } catch (_) {}
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }

  document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));
  console.log("🎤 Listening stopped");
}

/**
 * Cancel TTS
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
 * Speak text (basic implementation - main app has full version)
 */
export function speakText(text) {
  if (!text) return;

  stopSpeaking();

  if (!("speechSynthesis" in window)) {
    console.warn("No speechSynthesis available");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 0.95;
  utterance.pitch = 1.2;

  isSpeaking = true;
  document.dispatchEvent(new CustomEvent("avatarTalkStart"));

  utterance.onend = () => {
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
    
    // If in continuous mode, restart listening
    if (_continuous && _onFinal) {
      setTimeout(() => {
        if (!isSpeaking && _continuous) {
          startListening(_onFinal, { continuous: true });
        }
      }, 800);
    }
  };

  utterance.onerror = (e) => {
    console.error("TTS error:", e);
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  };

  try { 
    window.speechSynthesis.speak(utterance); 
  } catch (e) {
    console.error("Speech error:", e);
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  }
}

// Expose for global access if needed
if (typeof window !== "undefined") {
  window.speakText = speakText;
  window.stopSpeaking = stopSpeaking;
  window.startListening = startListening;
  window.stopListening = stopListening;
}

export default {
  startListening,
  stopListening,
  stopSpeaking,
  speakText
};