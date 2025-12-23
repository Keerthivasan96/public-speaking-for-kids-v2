// ============================================
// speech.js - PRODUCTION FIXES
// Fix #1: Stricter early-send gating
// Fix #2: Better incomplete phrase detection
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
// TIGHTENED TIMING - Prevents premature sends
// ============================================
const CONFIG = {
  baseSilence: isMobile ? 850 : 400,           // Increased from 280/700
  shortPhraseSilence: 600,                     // Increased from 420
  completeSilence: 220,                        // Increased from 180
  
  minSendGap: 1100,                            // Increased from 900
  restartDelay: isMobile ? 250 : 120,
  minWordsForEarlySend: 5,                     // CRITICAL: Changed from 3 to 5
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} mode`);

/**
 * STRICTER intent detection
 */
function hasCompleteIntent(text) {
  const lower = text.toLowerCase().trim();
  const lastChar = text.trim().slice(-1);
  
  // Clear sentence ending
  if (['.', '!', '?'].includes(lastChar)) {
    return true;
  }
  
  // Complete statement patterns (must be 4+ words)
  const completeStatements = [
    /^(my name is|i am|i'm) \w+$/i,
    /^(i live in|i work at|i go to) /i,
    /^(i like|i love|i hate|i want|i need) /i,
    /^(yes|no|yeah|yep|nope|okay|sure)$/i,
  ];
  
  return completeStatements.some(pattern => pattern.test(lower));
}

/**
 * Detect if phrase is clearly incomplete
 */
function isIncompletePhrase(text) {
  const lower = text.toLowerCase().trim();
  
  // These phrases are ALWAYS incomplete
  const incompleteStarters = [
    /^(tell me|show me|give me|can you|could you|would you|will you)$/i,
    /^(tell me a|give me a|show me a)$/i,
    /^(what|what's|how|how's|why|when|where|who|which)$/i,
    /^(i want|i need|i'm|i am)$/i,
    /^(do you|are you|is it|can i|should i)$/i,
  ];
  
  return incompleteStarters.some(pattern => pattern.test(lower));
}

function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  
  // Clear sentence ending - SEND
  if (['.', '!', '?'].includes(lastChar)) {
    console.log(`✅ Complete sentence (${wordCount} words)`);
    return CONFIG.completeSilence;
  }
  
  // Check if clearly incomplete
  if (isIncompletePhrase(text)) {
    console.log(`⏳ Incomplete phrase detected - waiting`);
    return CONFIG.shortPhraseSilence;
  }
  
  // One-word - only if it's a complete response
  if (wordCount === 1) {
    const oneWordComplete = /^(yes|no|yeah|yep|nope|ok|okay|sure|hi|hey|hello|bye|thanks|please)$/i;
    if (oneWordComplete.test(text.toLowerCase())) {
      console.log(`✅ Quick one-word response`);
      return CONFIG.completeSilence;
    }
    console.log(`⏳ Single word - waiting for more`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 2-3 words - be VERY cautious
  if (wordCount <= 3) {
    const shortComplete = /^(i'?m (good|fine|great|okay|tired)|that'?s (good|great|cool|nice)|sounds (good|great))$/i;
    if (shortComplete.test(text.toLowerCase())) {
      console.log(`✅ Complete short phrase (${wordCount} words)`);
      return CONFIG.baseSilence;
    }
    console.log(`⏳ ${wordCount} words - likely incomplete, waiting`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 4 words - still cautious
  if (wordCount === 4) {
    console.log(`📝 4 words - waiting to confirm complete`);
    return CONFIG.baseSilence;
  }
  
  // 5+ words - likely complete
  console.log(`📝 Normal sentence (${wordCount} words)`);
  return CONFIG.baseSilence;
}

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
      const result = event.results[i];
      const text = result[0].transcript;

      if (result.isFinal) {
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

    // ⚡ STRICTER early send - only on clear complete intent
    if (
      interim &&
      interim.length > 12 &&                    // Longer threshold
      Date.now() - lastSendTime > CONFIG.minSendGap
    ) {
      const words = interim.trim().split(/\s+/).length;
      
      // Must be 5+ words AND have complete intent
      if (words >= CONFIG.minWordsForEarlySend && hasCompleteIntent(interim)) {
        console.log("⚡ Early send (complete intent):", interim);
        finalize((pendingText + interim).trim());
        return;
      }
      
      // Block early send if clearly incomplete
      if (isIncompletePhrase(interim)) {
        console.log("🚫 Blocking early send - incomplete phrase");
        const timeout = getTimeout(fullText);
        silenceTimer = setTimeout(() => finalize(fullText), timeout);
        return;
      }
    }

    // Normal silence-based finalize
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