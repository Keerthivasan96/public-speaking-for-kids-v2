export function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

export function showTranscript(text) {
  const t = document.getElementById("transcript");
  t.style.display = "block";
  t.textContent = text;
}

export function showReply(text) {
  const r = document.getElementById("reply");
  r.textContent = text;
}
