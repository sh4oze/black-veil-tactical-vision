/**
 * Optional spoken feedback for HUD log events, built on the browser's native
 * SpeechSynthesis API — no external service, no network request, nothing recorded.
 * Disabled by default; only speaks when Options > Voice Feedback is on.
 */
let enabled = false;

export function setVoiceFeedbackEnabled(value: boolean): void {
  enabled = value;
  if (!value && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function speak(text: string): void {
  if (!enabled) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.05;
  utterance.pitch = 0.75;
  utterance.volume = 0.8;
  window.speechSynthesis.speak(utterance);
}
