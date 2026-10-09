// Buffer final segments until an endpoint or an explicitly closed speech stream.
// Deepgram may return is_final without speech_final when silence is not sent.
function createTranscriptCollector(onSpeech) {
  let segments = [];
  const seen = new Set();
  function flush() {
    if (!segments.length) return;
    const parts = segments;
    segments = [];
    onSpeech({
      transcript: parts.map((r) => r.transcript).join(" "),
      isFinal: true,
      speechFinal: true,
      confidence: Math.min(...parts.map((r) => Number(r.confidence || 0))),
      words: parts.flatMap((r) => r.words || []),
    });
  }
  function accept(r) {
    if (!r.isFinal) return;
    if (r.transcript?.trim()) {
      const key = JSON.stringify([r.raw?.start, r.raw?.duration, r.transcript]);
      if (!seen.has(key)) {
        seen.add(key);
        segments.push(r);
      }
    }
    if (r.speechFinal) flush();
  }
  return { accept, flush };
}
module.exports = { createTranscriptCollector };