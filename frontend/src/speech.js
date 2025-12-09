// frontend/src/speech.js
// Improved SpeechRecognition + TTS utility.

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;   // <-- PATCH: unified speaking flag

/**
 * Start listening for speech.
 */
export function startListening(onTextFinal, options = { continuous: false, lang: "en-IN" }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Your browser does not support SpeechRecognition.");
    return;
  }

  // ⛔ PATCH: Do NOT start recognition while TTS is speaking
  if (isSpeaking) {
    console.log("startListening blocked: TTS speaking");
    return;
  }

  _onFinal = onTextFinal;
  _continuous = !!options.continuous;

  // If already listening
  if (recognition && _isListening) {
    console.log("startListening: already active — updating callback/options");
    return;
  }

  // Fresh instance
  try {
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch (_) {}
      recognition = null;
    }
  } catch (_) {}

  recognition = new SpeechRecognition();
  recognition.lang = options.lang || "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("🎤 SpeechRecognition started");
    _isListening = true;
    document.dispatchEvent(new CustomEvent("speechRecognitionStarted"));
  };

  recognition.onresult = (event) => {
    const text = event?.results?.[0]?.[0]?.transcript || "";
    if (typeof _onFinal === "function") {
      try { _onFinal(text); } catch (e) {}
    }
  };

  recognition.onerror = (e) => {
    console.warn("SpeechRecognition error", e);
    document.dispatchEvent(new CustomEvent("speechRecognitionError", { detail: e }));
  };

  recognition.onend = () => {
    console.log("🎤 SpeechRecognition ended");
    _isListening = false;
    document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));

    // 🔁 PATCH: DO NOT RESTART IF TTS IS SPEAKING
    if (_continuous && !isSpeaking) {
      setTimeout(() => {
        try {
          if (_continuous && !isSpeaking) {
            recognition.start();
          }
        } catch (e) {
          console.warn("Failed to restart recognition:", e);
        }
      }, 250);
    }
  };

  try { recognition.start(); } catch (e) {}
}

/**
 * Stop listening and prevent auto restart.
 */
export function stopListening() {
  _continuous = false;
  _onFinal = null;
  _isListening = false;

  if (recognition) {
    try { recognition.onend = null; } catch (_) {}
    try { recognition.onerror = null; } catch (_) {}
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }

  document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));
}

/**
 * Cancel TTS
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  isSpeaking = false;
  document.dispatchEvent(new CustomEvent("avatarTalkStop"));
}

/**
 * Speak text
 */
export function speakText(text) {
  if (!text) return;

  stopSpeaking(); // cancel prior TTS

  if (!("speechSynthesis" in window)) {
    console.warn("No speechSynthesis available");
    return;
  }

  const u = new SpeechSynthesisUtterance(text);

  isSpeaking = true;
  document.dispatchEvent(new CustomEvent("avatarTalkStart"));

  u.onend = () => {
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  };

  u.onerror = (e) => {
    console.error("TTS error:", e);
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  };

  try { window.speechSynthesis.speak(u); }
  catch (e) {
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
  }
}

if (typeof window !== "undefined" && typeof window.speakText !== "function") {
  window.speakText = speakText;
}

export default {
  startListening,
  stopListening,
  stopSpeaking,
  speakText
};
