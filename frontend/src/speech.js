// ============================================================
// FIXED SpeechRecognition + TTS  (SUPER STABLE FOR MOBILE + PC)
// Uses OLD stable logic + mobile onspeechend fix
// ============================================================

let recognition = null;
let _onFinal = null;
let _continuous = false;
let _isListening = false;
let isSpeaking = false;
let restartTimer = null;

// Detect mobile
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
console.log("Speech Engine Loaded → Device:", isMobile ? "MOBILE" : "DESKTOP");

/**
 * START LISTENING — FINAL STABLE VERSION
 */
export function startListening(onFinalCallback, options = { continuous: false, lang: "en-IN" }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech Recognition not supported on this browser.");
        return;
    }

    // Do not start if TTS is talking
    if (isSpeaking) {
        console.log("⛔ Blocked: TTS speaking");
        if (options.continuous) {
            _continuous = true;
            _onFinal = onFinalCallback;
        }
        return;
    }

    _onFinal = onFinalCallback;
    _continuous = options.continuous;

    // Already listening?
    if (recognition && _isListening) {
        console.log("⚠ Already listening (skipping)");
        return;
    }

    // Clean previous recognizer
    cleanup();

    recognition = new SpeechRecognition();
    recognition.lang = options.lang || "en-IN";

    // *** CRITICAL STABLE SETTINGS ***
    recognition.continuous = false;       // PC + mobile reliable mode
    recognition.interimResults = false;   // ALWAYS return final transcript
    recognition.maxAlternatives = 1;

    // ******** STABLE MOBILE FIX ********
    recognition.onspeechend = () => {
        console.log("🎤 Speech ended → stopping recognition");
        try { recognition.stop(); } catch (e) {}
    };
    // ***********************************

    recognition.onstart = () => {
        console.log("🎤 Listening started");
        _isListening = true;
        document.dispatchEvent(new CustomEvent("speechRecognitionStarted"));
    };

    recognition.onresult = (event) => {
        const finalText = event.results[0][0].transcript.trim();
        console.log("🎤 Final transcript:", finalText);

        if (finalText && typeof _onFinal === "function") {
            _onFinal(finalText);
        }
    };

    recognition.onerror = (e) => {
        console.warn("❌ SpeechRecognition error:", e.error);
        document.dispatchEvent(new CustomEvent("speechRecognitionError", { detail: e }));
    };

    recognition.onend = () => {
        console.log("🎤 Recognition ended");
        _isListening = false;
        document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));

        // CONTINUOUS MODE LOOP
        if (_continuous && !isSpeaking) {
            restartTimer = setTimeout(() => {
                console.log("🔄 Restarting listening (continuous mode)");
                startListening(_onFinal, { continuous: true, lang: options.lang });
            }, 400);
        }
    };

    // Start recognition
    try {
        recognition.start();
        console.log("🎤 Recognition start (OK)");
    } catch (e) {
        console.error("Failed to start recognition:", e);
    }
}

/**
 * STOP LISTENING
 */
export function stopListening() {
    console.log("🛑 stopListening() called");

    _continuous = false;
    _onFinal = null;
    _isListening = false;

    cleanup();

    document.dispatchEvent(new CustomEvent("speechRecognitionStopped"));
}

/**
 * Cleanup recognition safely
 */
function cleanup() {
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    if (recognition) {
        try { recognition.onend = null; } catch (_) {}
        try { recognition.onerror = null; } catch (_) {}
        try { recognition.onresult = null; } catch (_) {}
        try { recognition.stop(); } catch (_) {}
        recognition = null;
    }
}

/**
 * STOP TTS instantly
 */
export function stopSpeaking() {
    if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    isSpeaking = false;
    document.dispatchEvent(new CustomEvent("avatarTalkStop"));
}

/**
 * SPEAK TEXT — consistent voice across devices
 */
export function speakText(text) {
    if (!text) return;

    stopSpeaking();

    if (!("speechSynthesis" in window)) {
        console.warn("No TTS available");
        return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.95;
    utter.pitch = 1.15;     // teen female tone
    utter.volume = 1.0;

    isSpeaking = true;
    document.dispatchEvent(new CustomEvent("avatarTalkStart"));

    utter.onend = () => {
        console.log("🔇 TTS ended");
        isSpeaking = false;
        document.dispatchEvent(new CustomEvent("avatarTalkStop"));

        // Auto restart listening
        if (_continuous && _onFinal) {
            setTimeout(() => {
                if (!isSpeaking) {
                    console.log("🎤 Restart listening after TTS");
                    startListening(_onFinal, { continuous: true });
                }
            }, 600);
        }
    };

    utter.onerror = (e) => {
        console.error("TTS error:", e);
        isSpeaking = false;
    };

    try {
        window.speechSynthesis.cancel(); // prevent overlap
        window.speechSynthesis.speak(utter);
        console.log("🔊 Speaking");
    } catch (e) {
        console.error("Speech error:", e);
        isSpeaking = false;
    }
}

// Global access for debugging
if (typeof window !== "undefined") {
    window.startListening = startListening;
    window.stopListening = stopListening;
    window.speakText = speakText;
    window.stopSpeaking = stopSpeaking;
}

export default {
    startListening,
    stopListening,
    speakText,
    stopSpeaking
};
