// frontend/src/speech.js
// Improved Speech Recognition - Captures full sentences

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;
let recognitionRestartTimer = null;
let silenceTimer = null;
let interimTranscript = "";
let finalTranscript = "";

// IMPROVED: Longer silence detection for full sentences
const SILENCE_TIMEOUT = 1800; // 1.8 seconds of silence before finalizing

/**
 * Start listening with improved full-sentence capture
 */
export function startListening(onTextFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Your browser doesn't support speech recognition.");
    return;
  }

  // Don't start if TTS is speaking
  if (isSpeaking) {
    console.log("Recognition blocked: TTS speaking");
    if (options.continuous) {
      _onFinal = onTextFinal;
      _continuous = true;
    }
    return;
  }

  _onFinal = onTextFinal;
  _continuous = !!options.continuous;

  // If already listening, update callback
  if (recognition && _isListening) {
    console.log("Already listening - updating callback");
    return;
  }

  // Clean up existing
  try {
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch (_) {}
      recognition = null;
    }
  } catch (_) {}

  clearTimeout(recognitionRestartTimer);
  clearTimeout(silenceTimer);
  
  interimTranscript = "";
  finalTranscript = "";

  // Create new recognition
  recognition = new SpeechRecognition();
  recognition.lang = options.lang || "en-IN";
  recognition.continuous = true; // KEEP LISTENING for full sentences
  recognition.interimResults = true; // Get partial results
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("🎤 Recognition started");
    _isListening = true;
    document.dispatchEvent(new CustomEvent("speechRecognitionStarted"));
  };

  recognition.onresult = (event) => {
    // Clear silence timer - user is still speaking
    clearTimeout(silenceTimer);

    interimTranscript = "";
    
    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
        console.log("🎤 Final fragment:", transcript);
      } else {
        interimTranscript += transcript;
        console.log("🎤 Interim:", transcript);
      }
    }

    // Start silence detection timer
    // If user stops speaking for SILENCE_TIMEOUT ms, finalize the result
    silenceTimer = setTimeout(() => {
      const fullText = (finalTranscript + interimTranscript).trim();
      
      if (fullText && typeof _onFinal === "function") {
        console.log("🎤 Complete sentence:", fullText);
        
        try {
          _onFinal(fullText, true); // true = isFinal
        } catch (e) {
          console.error("Error in callback:", e);
        }
        
        // Reset transcripts
        finalTranscript = "";
        interimTranscript = "";
        
        // Stop recognition (app will restart if in continuous mode)
        stopListening();
      }
    }, SILENCE_TIMEOUT);
  };

  recognition.onerror = (e) => {
    console.warn("Recognition error:", e.error);
    clearTimeout(silenceTimer);
    
    // Don't restart on certain errors
    if (e.error === 'aborted' || e.error === 'no-speech') {
      document.dispatchEvent(new CustomEvent("speechRecognitionError", { detail: e }));
    }
  };

  recognition.onend = () => {
    console.log("🎤 Recognition ended");
    _isListening = false;
    clearTimeout(silenceTimer);
    document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));

    // Auto-restart in continuous mode if not speaking
    if (_continuous && !isSpeaking) {
      recognitionRestartTimer = setTimeout(() => {
        try {
          if (_continuous && !isSpeaking && recognition) {
            console.log("🔄 Restarting recognition");
            recognition.start();
          }
        } catch (e) {
          console.warn("Restart failed:", e);
          
          // Try recreating if restart fails
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
      }, 500);
    }
  };

  try {
    recognition.start();
    console.log("🎤 Started listening (improved mode)");
  } catch (e) {
    console.error("Failed to start:", e);
  }
}

/**
 * Stop listening
 */
export function stopListening() {
  _continuous = false;
  _onFinal = null;
  _isListening = false;

  clearTimeout(recognitionRestartTimer);
  clearTimeout(silenceTimer);

  if (recognition) {
    try { recognition.onend = null; } catch (_) {}
    try { recognition.onerror = null; } catch (_) {}
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }

  interimTranscript = "";
  finalTranscript = "";

  document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));
  console.log("🎤 Stopped listening");
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
 * Speak text
 */
export function speakText(text) {
  if (!text) return;

  stopSpeaking();

  if (!("speechSynthesis" in window)) {
    console.warn("No TTS available");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1.22;

  isSpeaking = true;
  document.dispatchEvent(new CustomEvent("avatarTalkStart"));

  utterance.onend = () => {
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
    
    if (_continuous && _onFinal) {
      setTimeout(() => {
        if (!isSpeaking && _continuous) {
          startListening(_onFinal, { continuous: true, interimResults: true });
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

// Global access
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