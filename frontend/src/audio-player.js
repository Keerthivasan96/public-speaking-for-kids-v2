let onStartCb = null;
let onEndCb = null;

export function onAudioStart(cb) { onStartCb = cb; }
export function onAudioEnd(cb) { onEndCb = cb; }

export function playText(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      console.warn("No speechSynthesis available");
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    // optional voice selection (pick first en voice)
    const voices = speechSynthesis.getVoices();
    if (voices && voices.length) {
      const en = voices.find(v => v.lang && v.lang.startsWith("en"));
      if (en) u.voice = en;
    }
    u.onstart = () => { if (onStartCb) onStartCb(); };
    u.onend = () => { if (onEndCb) onEndCb(); resolve(); };
    u.onerror = () => { if (onEndCb) onEndCb(); resolve(); };
    // Cancel existing speech then speak
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
