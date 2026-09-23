// Browser-only controlled mock: no microphone or recognition service is contacted.
module.exports = function installSpeechMock({ prefixed = false, absent = false } = {}) {
  window.__speech = { runs: [], deferEnd: false, deferStart: false, startError: false };
  class MockRecognition {
    constructor() { window.__speech.runs.push(this); this.starts = 0; this.stops = 0; this.aborts = 0; }
    start() { this.starts++; if (window.__speech.startError) throw new Error('permission'); if (!window.__speech.deferStart) this.onstart?.(); }
    stop() { this.stops++; if (!window.__speech.deferEnd) setTimeout(() => this.onend?.(), 10); }
    abort() { this.aborts++; this.onend?.(); }
    result(parts) {
      this.onresult?.({ results: parts.map(([text, final]) => { const result = [{ transcript: text }]; result.isFinal = final; return result; }) });
    }
    error(error) { this.onerror?.({ error }); }
    end() { this.onend?.(); }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: !absent && !prefixed ? MockRecognition : undefined });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: !absent && prefixed ? MockRecognition : undefined });
};
