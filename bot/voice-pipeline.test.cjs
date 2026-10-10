const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createTranscriptCollector } = require("./voice-transcripts");

test("final segments without speech_final are retained and combined on close", () => {
  const results = [];
  const collector = createTranscriptCollector((r) => results.push(r));
  collector.accept({ transcript: "you are", isFinal: false });
  collector.accept({ transcript: "you are", isFinal: true, confidence: 0.99, words: [{ word: "you" }] });
  collector.accept({ transcript: "an idiot", isFinal: true, confidence: 0.95, words: [{ word: "idiot" }] });
  assert.equal(results.length, 0);
  collector.flush();
  collector.flush();
  assert.equal(results.length, 1);
  assert.equal(results[0].transcript, "you are an idiot");
  assert.equal(results[0].confidence, 0.95);
  assert.equal(results[0].words.length, 2);
});

test("empty endpoint flushes earlier finals and repeated final results are not punished twice", () => {
  const results = [];
  const collector = createTranscriptCollector((r) => results.push(r));
  const final = { transcript: "hello", isFinal: true, raw: { start: 0, duration: 1 } };
  collector.accept(final);
  collector.accept({ transcript: "", isFinal: true, speechFinal: true });
  collector.accept(final);
  collector.flush();
  assert.equal(results.length, 1);
});

function streamHarness() {
  const timers = new Map();
  let nextId = 0;
  class Socket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    constructor() { super(); this.readyState = 0; this.sent = []; Socket.last = this; }
    send(data) { this.sent.push(data); }
    terminate() { this.readyState = 3; this.emit("close", 1000, ""); }
  }
  const sandbox = {
    require: (name) => name === "ws" ? Socket : require(name),
    module: { exports: {} }, __dirname, process: { env: {} }, URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./deepgram-manager"), "utf8"), sandbox);
  const Manager = sandbox.module.exports;
  const manager = Object.create(Manager.prototype);
  manager.keyterms = []; manager.model = "nova-3";
  const results = [];
  const collector = createTranscriptCollector((r) => results.push(r));
  const stream = manager.createStream({ account: { id: 1, key: "test-only" }, onTranscript: collector.accept, onClose: collector.flush });
  const socket = Socket.last;
  return { stream, socket, timers, results,
    open() { socket.readyState = 1; socket.emit("open"); },
    result(transcript, extra = {}) { socket.emit("message", Buffer.from(JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript, confidence: 0.99, words: [] }] }, ...extra }))); },
  };
}

test("stream close sends Finalize control only and waits for delayed final results", () => {
  const h = streamHarness(); h.open();
  h.stream.send(Buffer.from([1, 2])); h.stream.close(); h.stream.close();
  assert.equal(h.stream.send(Buffer.from([3, 4])), false);
  assert.equal(h.socket.sent.length, 2);
  assert.equal(JSON.parse(h.socket.sent[1]).type, "Finalize");
  assert.equal([...h.timers.values()][0].delay, 5000);
  h.result("you are an idiot", { from_finalize: true });
  assert.equal(JSON.parse(h.socket.sent[2]).type, "CloseStream");
  h.socket.terminate();
  assert.equal(h.results[0].transcript, "you are an idiot");
  assert.equal(h.timers.size, 0);
});

test("short speech queued during connection is uploaded before Finalize", () => {
  const h = streamHarness();
  h.stream.send(Buffer.from([1, 2])); h.stream.close();
  assert.equal(h.socket.readyState, 0);
  h.open();
  assert.ok(Buffer.isBuffer(h.socket.sent[0]));
  assert.equal(JSON.parse(h.socket.sent[1]).type, "Finalize");
  h.result("hello", { from_finalize: true }); h.socket.terminate();
  assert.equal(h.results.length, 1);
});

test("finalization without acknowledgement has a bounded close fallback", () => {
  const h = streamHarness(); h.open(); h.stream.close();
  [...h.timers.values()][0].fn();
  assert.equal(JSON.parse(h.socket.sent.at(-1)).type, "CloseStream");
  [...h.timers.values()][0].fn();
  assert.equal(h.socket.readyState, 3);
});

function audioHarness() {
  const source = fs.readFileSync(require.resolve("./index.js"), "utf8");
  const opus = new EventEmitter();
  opus.destroy = () => {};
  opus.pipe = (decoder) => { opus.decoder = decoder; return decoder; };
  class Decoder extends EventEmitter { destroy() {} }
  let nextId = 0;
  const timers = new Map(); const events = []; const streams = [];
  const listening = new Map();
  const context = {
    Buffer, Math, Number, listening,
    config: { settings: {} }, activeKeyId: 1,
    EndBehaviorType: { AfterSilence: 1 }, prism: { opus: { Decoder } },
    deepgram: { addUsage: (_id, bytes) => events.push(["usage", bytes]) },
    openDeepgram: (_member, _channel, onText) => {
      const sent = [];
      const stream = { sent, send: (b) => { sent.push(b); return true; }, close: () => events.push(["finalize"]), onText };
      streams.push(stream); return stream;
    },
    moderate: (_member, _channel, text) => events.push(["moderate", text]),
    process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("const VAD_RMS"), source.indexOf("// ---------------------------------------------------------------- moderation")), context);
  context.listen({ receiver: { subscribe: () => opus } }, { id: "12345" }, { name: "voice" });
  return { opus, events, streams, timers, listening,
    frame(amplitude) {
      const pcm = Buffer.alloc(3840);
      for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(amplitude, i);
      opus.decoder.emit("data", pcm);
    },
  };
}

test("real listen path sends no silence or below-gate noise and finalizes on local pause", () => {
  const h = audioHarness();
  for (let i = 0; i < 100; i++) h.frame(0);
  for (let i = 0; i < 100; i++) h.frame(250);
  assert.equal(h.streams.length, 0);
  for (let i = 0; i < 25; i++) h.frame(3000);
  assert.equal(h.streams.length, 1);
  const uploaded = h.streams[0].sent.length;
  for (let i = 0; i < 100; i++) h.frame(0);
  assert.equal(h.streams[0].sent.length, uploaded);
  [...h.timers.values()][0].fn();
  assert.equal(h.events.at(-1)[0], "finalize");
  assert.equal(h.events[0][1], uploaded * 640);
  h.streams[0].onText({ transcript: "you are an idiot" });
  assert.deepEqual(h.events.at(-1), ["moderate", "you are an idiot"]);
  h.opus.decoder.emit("end");
  assert.equal(h.listening.size, 0);
  assert.equal(h.events.filter(([event]) => event === "usage").length, 1);
});

test("decoder errors release the listener so the next speech can be received", () => {
  const h = audioHarness();
  h.opus.decoder.emit("error", new Error("decode failure"));
  assert.equal(h.listening.size, 0);
});

test("speech after a pause starts a fresh stream without duplicate usage accounting", () => {
  const h = audioHarness();
  for (let i = 0; i < 25; i++) h.frame(3000);
  [...h.timers.values()][0].fn();
  for (let i = 0; i < 25; i++) h.frame(3000);
  assert.equal(h.streams.length, 2);
  h.opus.decoder.emit("end");
  assert.equal(h.events.filter(([event]) => event === "usage").length, 2);
});