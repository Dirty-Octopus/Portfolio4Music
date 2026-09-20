import { test } from "node:test";
import assert from "node:assert/strict";
import { Scrubber } from "../src/scrubber.js";
import { TurnCharge } from "../src/surprise.js";
import {
  PlaybackEngine,
  formatTime,
  clamp,
  FADE_SECONDS,
} from "../src/player.js";

class FakeParam {
  constructor(value) {
    this.value = value;
    this.ramps = [];
  }
  cancelAndHoldAtTime() {}
  cancelScheduledValues() {}
  setValueAtTime(value) {
    this.value = value;
  }
  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.ramps.push({ value, time });
  }
  setTargetAtTime(value) {
    this.value = value;
  }
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.connections = [];
  }
  connect(target) {
    this.connections.push(target);
    return target;
  }
  disconnect() {}
}

class FakeBufferSource extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.started = 0;
    this.stopped = 0;
    this.onended = null;
    this.playbackRate = new FakeParam(1);
  }
  start(...args) {
    this.started += 1;
    this.startArgs = args;
  }
  stop(time) {
    this.stopped += 1;
    this.stopTime = time;
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.state = "suspended";
    this.destination = new FakeNode();
    this.resumeCalls = 0;
    this.sources = [];
  }
  createGain() {
    return new FakeNode();
  }
  createAnalyser() {
    const node = new FakeNode();
    node.fftSize = 0;
    node.smoothingTimeConstant = 0;
    node.getByteFrequencyData = () => {};
    return node;
  }
  createMediaElementSource() {
    return new FakeNode();
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 0.1 });
  }
  resume() {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }
}

class FakeMedia extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.ended = false;
    this.seeking = false;
    this._time = 0;
    this.duration = 60;
    this.error = null;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.attributes = {};
  }
  get currentTime() {
    return this._time;
  }
  set currentTime(value) {
    this._time = value;
    this.seeking = true;
    queueMicrotask(() => {
      this.seeking = false;
      this.dispatchEvent(new Event("seeked"));
    });
  }
  get src() {
    return this.attributes.src || "";
  }
  set src(value) {
    this.attributes.src = value;
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  load() {
    this.loadCalls += 1;
  }
  play() {
    this.playCalls += 1;
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.pauseCalls += 1;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

function makeEngine(options = {}) {
  const audio = new FakeMedia();
  const video = new FakeMedia();
  const errors = [];
  const changes = [];
  const context = new FakeContext();
  const engine = new PlaybackEngine({
    audio,
    video,
    contextFactory: () => context,
    wait: async () => {},
    onChange: () => changes.push(1),
    onError: (message) => errors.push(message),
    ...options,
  });
  return { engine, audio, video, context, errors, changes };
}

test("formatTime pads minutes and seconds", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(61), "01:01");
  assert.equal(formatTime(3599), "59:59");
  assert.equal(formatTime(-5), "00:00");
  assert.equal(formatTime(Number.NaN), "00:00");
});

test("clamp coerces and bounds values", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp("abc", 0, 10), 0);
  assert.equal(clamp("0.5", 0, 1), 0.5);
});

test("unlock initializes the graph and resumes synchronously", async () => {
  const { engine, context } = makeEngine();
  const resumed = engine.unlock();
  assert.equal(context.resumeCalls, 1);
  await resumed;
  assert.equal(context.state, "running");
  assert.equal(engine.master.gain.value, 0.65);
  assert.ok(engine.gains.audio);
  assert.ok(engine.gains.video);
  assert.ok(engine.analyser);
});

test("play sets the source, plays, and ramps gain in", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  assert.equal(audio.getAttribute("src"), "media/a.mp3");
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.paused, false);
  assert.equal(engine.active, "audio");
  assert.equal(engine.gains.audio.gain.value, 1);
});

test("play reuses the source when it already matches", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  await engine.pause("audio");
  await engine.play("audio", "media/a.mp3");
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 2);
});

test("starting video pauses audio (no overlapping playback)", async () => {
  const { engine, audio, video } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  await engine.play("video");
  assert.equal(audio.paused, true);
  assert.equal(video.paused, false);
  assert.equal(engine.active, "video");
});

test("starting audio pauses video", async () => {
  const { engine, audio, video } = makeEngine();
  await engine.play("video");
  await engine.play("audio", "media/a.mp3");
  assert.equal(video.paused, true);
  assert.equal(audio.paused, false);
});

test("external media control cannot create overlapping playback", async () => {
  const { engine, audio, video } = makeEngine();
  await engine.play("video");
  await audio.play();
  assert.equal(video.paused, true);
  assert.equal(audio.paused, false);
  assert.equal(engine.active, "audio");
});

test("rapid track switches only start the last request", async () => {
  const { engine, audio } = makeEngine();
  const first = engine.play("audio", "media/one.mp3");
  const second = engine.play("audio", "media/two.mp3");
  await Promise.all([first, second]);
  assert.equal(audio.getAttribute("src"), "media/two.mp3");
  assert.equal(audio.playCalls, 1);
  assert.equal(engine.active, "audio");
});

test("seek keeps a paused element paused", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  await engine.pause("audio");
  const calls = audio.playCalls;
  await engine.seek("audio", 30);
  assert.equal(audio.currentTime, 30);
  assert.equal(audio.paused, true);
  assert.equal(audio.playCalls, calls);
});

test("seek resumes a playing element", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  await engine.seek("audio", 30, true);
  assert.equal(audio.currentTime, 30);
  assert.equal(audio.paused, false);
  assert.equal(engine.active, "audio");
});

test("seek clamps to the media duration", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  await engine.seek("audio", 9999);
  assert.equal(audio.currentTime, 60 - 0.015);
});

test("toggle plays when paused and pauses when playing", async () => {
  const { engine } = makeEngine();
  await engine.toggle("audio");
  assert.equal(engine.active, "audio");
  await engine.toggle("audio");
  assert.equal(engine.active, null);
});

test("repeat replays the audio track after it ends", async () => {
  const { engine, audio } = makeEngine();
  engine.repeat = true;
  await engine.play("audio", "media/a.mp3");
  const calls = audio.playCalls;
  audio.ended = true;
  audio.dispatchEvent(new Event("ended"));
  await engine.queue;
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.playCalls, calls + 1);
  assert.equal(audio.paused, false);
});

test("ended without repeat clears the active track", async () => {
  const { engine, audio } = makeEngine();
  await engine.play("audio", "media/a.mp3");
  audio.ended = true;
  audio.dispatchEvent(new Event("ended"));
  await engine.queue;
  assert.equal(engine.active, null);
});

test("media errors surface through onError", () => {
  const { engine, audio, errors } = makeEngine();
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event("error"));
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("媒体加载失败"));
});

test("volume and mute drive the master gain", async () => {
  const { engine } = makeEngine();
  await engine.unlock();
  engine.setVolume(0.4);
  assert.equal(engine.master.gain.value, 0.4);
  engine.setMuted(true);
  assert.equal(engine.master.gain.value, 0);
  engine.setMuted(false);
  assert.equal(engine.master.gain.value, 0.4);
});

test("sfx preloads, decodes once, and never stacks voices", async () => {
  const { engine, context } = makeEngine();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
  try {
    await engine.preloadSfx({ clickeffect: "/media/clickeffect.wav" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(engine.rawSfx.clickeffect instanceof ArrayBuffer);
  await engine.unlock();
  await engine.sfx("clickeffect");
  await engine.sfx("clickeffect");
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[0].stopped, 1);
  assert.equal(context.sources[1].stopped, 0);
  assert.equal(context.sources[1].started, 1);
});

test("sfx is silent when disabled", async () => {
  const { engine, context } = makeEngine();
  engine.rawSfx = { clickeffect: new ArrayBuffer(8) };
  engine.sfxEnabled = false;
  await engine.unlock();
  await engine.sfx("clickeffect");
  assert.equal(context.sources.length, 0);
});

test("intro cues play once and retain their tail through hover and click sounds", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.rawSfx = Object.fromEntries(
    ["bootupcrt", "flicker", "preselect", "clickeffect"].map((name) => [
      name,
      new ArrayBuffer(8),
    ]),
  );
  await engine.sfx("bootupcrt");
  const boot = engine.cueVoice.source;
  boot.onended();
  await engine.sfx("flicker");
  const flicker = engine.cueVoice.source;
  await engine.sfx("preselect");
  const hover = engine.sfxVoice.source;
  await engine.sfx("clickeffect");
  assert.equal(hover.stopped, 0);
  assert.equal(flicker.stopped, 0);
  assert.equal(flicker.loop, undefined);
  await engine.sfx("flicker");
  await engine.sfx("bootupcrt");
  assert.equal(context.sources.length, 4);
  flicker.onended();
  assert.equal(engine.cueVoice, null);
  assert.ok(engine.sfxVoice);
});

test("SFX off stops both sound lanes without stopping BGM", async () => {
  const { engine } = makeEngine();
  engine.rawSfx = Object.fromEntries(
    ["flicker", "preselect", "pad"].map((name) => [name, new ArrayBuffer(8)]),
  );
  await engine.setBgmEnabled(true);
  await engine.sfx("flicker");
  await engine.sfx("preselect");
  const cue = engine.cueVoice.source;
  const hover = engine.sfxVoice.source;
  engine.sfxEnabled = false;
  engine.stopSfx();
  assert.equal(cue.stopped, 1);
  assert.equal(hover.stopped, 1);
  assert.equal(engine.bgmVoice.source.stopped, 0);
});

test("SFX off invalidates an intro cue still decoding even when re-enabled", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.rawSfx = { flicker: new ArrayBuffer(8) };
  let finish;
  context.decodeAudioData = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = engine.sfx("flicker");
  engine.sfxEnabled = false;
  engine.stopSfx();
  engine.sfxEnabled = true;
  finish({ duration: 1.364 });
  await pending;
  assert.equal(context.sources.length, 0);
  assert.equal(engine.playedCues.size, 0);
});

test("concurrent preload groups preserve both early cues and ambient buffers", async () => {
  const { engine } = makeEngine();
  const originalFetch = globalThis.fetch;
  let finishPad;
  globalThis.fetch = async (path) => ({
    ok: true,
    arrayBuffer: () =>
      path === "pad"
        ? new Promise((resolve) => {
            finishPad = resolve;
          })
        : Promise.resolve(new ArrayBuffer(8)),
  });
  try {
    const background = engine.preloadSfx({ pad: "pad" });
    await engine.preloadSfx({ bootupcrt: "boot" });
    assert.ok(engine.rawSfx.bootupcrt);
    assert.equal(engine.rawSfx.pad, undefined);
    finishPad(new ArrayBuffer(16));
    await background;
    assert.equal(engine.rawSfx.bootupcrt.byteLength, 8);
    assert.equal(engine.rawSfx.pad.byteLength, 16);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gain fades are short enough to mask transport discontinuities", () => {
  assert.ok(FADE_SECONDS > 0 && FADE_SECONDS <= 0.05);
});

test("BGM loops once and remains independent of interface SFX", async () => {
  const { engine, context } = makeEngine();
  engine.rawSfx = { pad: new ArrayBuffer(8), preselect: new ArrayBuffer(8) };
  await engine.setBgmEnabled(true);
  const pad = engine.bgmVoice.source;
  assert.equal(pad.loop, true);
  assert.equal(pad.started, 1);
  await engine.setBgmEnabled(true);
  assert.equal(context.sources.length, 1);
  await engine.sfx("preselect");
  engine.sfxEnabled = false;
  engine.stopSfx();
  assert.equal(pad.stopped, 0);
  assert.equal(engine.bgmVoice.source, pad);
  await engine.setBgmEnabled(false);
  assert.equal(pad.stopped, 1);
  assert.equal(engine.bgmVoice, null);
  assert.equal(engine.bgmEnabled, false);
});

test("BGM ducks for either content player and recovers after pause or end", async () => {
  const { engine, audio, video } = makeEngine();
  engine.rawSfx = { pad: new ArrayBuffer(8) };
  await engine.setBgmEnabled(true);
  const gain = engine.bgmVoice.gain.gain;
  const idle = gain.value;
  await engine.play("audio", "media/a.mp3");
  assert.ok(gain.value < idle / 10);
  await engine.pause("audio");
  assert.equal(gain.value, idle);
  await engine.play("video", "media/v.mp4");
  assert.equal(audio.paused, true);
  assert.ok(gain.value < idle / 10);
  video.ended = true;
  video.dispatchEvent(new Event("ended"));
  assert.equal(gain.value, idle);
});

test("disabling BGM during decoding prevents a late start", async () => {
  const { engine, context } = makeEngine();
  let finishDecode;
  context.decodeAudioData = () =>
    new Promise((resolve) => {
      finishDecode = resolve;
    });
  engine.rawSfx = { pad: new ArrayBuffer(8) };
  const enabling = engine.setBgmEnabled(true);
  await Promise.resolve();
  await engine.setBgmEnabled(false);
  finishDecode({ duration: 60 });
  await enabling;
  assert.equal(context.sources.length, 0);
  assert.equal(engine.bgmEnabled, false);
  await engine.setBgmEnabled(true);
  assert.equal(context.sources.length, 1);
});

test("rapid BGM enables share decoding and only start the latest request", async () => {
  const { engine, context } = makeEngine();
  let finishDecode,
    decodes = 0;
  context.decodeAudioData = () => {
    decodes += 1;
    return new Promise((resolve) => {
      finishDecode = resolve;
    });
  };
  engine.rawSfx = { pad: new ArrayBuffer(8) };
  const first = engine.setBgmEnabled(true);
  await Promise.resolve();
  await engine.setBgmEnabled(false);
  const latest = engine.setBgmEnabled(true);
  await Promise.resolve();
  finishDecode({ duration: 60 });
  await Promise.all([first, latest]);
  assert.equal(decodes, 1);
  assert.equal(context.sources.length, 1);
  assert.equal(engine.bgmEnabled, true);
});

test("BGM can retry after a decoding error", async () => {
  const { engine, context, errors } = makeEngine();
  engine.rawSfx = { pad: new ArrayBuffer(8) };
  context.decodeAudioData = () => Promise.reject(new Error("decode failed"));
  await engine.setBgmEnabled(true);
  assert.equal(engine.bgmEnabled, false);
  assert.equal(errors.length, 1);
  context.decodeAudioData = () => Promise.resolve({ duration: 60 });
  await engine.setBgmEnabled(true);
  assert.equal(engine.bgmEnabled, true);
  assert.equal(context.sources.length, 1);
});

test("round accents replay and retain their tail through detents and hover", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.buffers.round = { duration: 1 };
  engine.buffers.clack = { duration: 0.159 };
  engine.buffers.preselect = { duration: 0.167 };
  await engine.sfx("round");
  const round = context.sources.at(-1);
  await engine.sfx("clack");
  await engine.sfx("preselect");
  assert.equal(round.stopped, 0);
  await engine.sfx("round");
  assert.notEqual(engine.accentVoice.source, round);
  engine.stopSfx();
  assert.equal(engine.accentVoice, null);
  assert.equal(context.sources.at(-1).stopped, 1);
});

test("rapid preselection retriggers every decoded request without a cooldown", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.buffers.preselect = { duration: 0.167 };
  for (let i = 0; i < 8; i++) await engine.sfx("preselect");
  assert.equal(context.sources.length, 8);
  assert.equal(context.sources.at(-1).started, 1);
  assert.equal(context.sources.filter((source) => source.stopped).length, 7);
});

async function makeScrubber(engine) {
  const scrubber = new Scrubber(engine, async () => () => {
    const node = new FakeNode();
    node.playbackRate = new FakeParam(1);
    node.pitch = new FakeParam(1);
    return node;
  });
  engine.scrubber = scrubber;
  engine.buffers.neuraasliderto = { duration: 8 / 3 };
  engine.buffers.neuraasliderfrom = { duration: 8 / 3 };
  await scrubber.prepare();
  return scrubber;
}

test("scrubbing maps the handle directly to directional source offsets and crossfades reversals", async () => {
  const { engine } = makeEngine();
  await engine.unlock();
  const scrubber = await makeScrubber(engine);
  scrubber.move(0.25, 0.375);
  const right = scrubber.voice;
  assert.equal(right.name, "neuraasliderto");
  assert.equal(right.source.startArgs[1], 2 / 3);
  assert.equal(right.source.playbackRate.value, 1);
  scrubber.move(0.25, -0.375);
  assert.equal(scrubber.voice.name, "neuraasliderfrom");
  assert.equal(scrubber.voice.source.startArgs[1], 2);
  assert.equal(right.gain.gain.ramps.at(-1).value, 0);
  assert.equal(right.gain.gain.ramps.at(-1).time, 0.06);
  assert.ok(Math.abs(right.source.stopTime - 0.07) < 1e-9);
});

test("scrubbing changes tempo with drag velocity while retaining the source and original pitch", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  const scrubber = await makeScrubber(engine);
  scrubber.move(0.1, 0.375);
  const voice = scrubber.voice;
  context.currentTime = 0.5;
  scrubber.move(0.2875, 0.75);
  assert.equal(scrubber.voice, voice);
  assert.equal(voice.source.started, 1);
  assert.equal(voice.source.stopped, 0);
  assert.equal(voice.source.playbackRate.value, 2);
  assert.equal(voice.processor.playbackRate.value, 2);
  assert.equal(voice.processor.pitch.value, 1);
});

test("scrubbing uses half-second envelopes without restarting the attack at every seek", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  const scrubber = await makeScrubber(engine);
  scrubber.move(0.3, 0.375);
  assert.deepEqual(scrubber.envelope.gain.ramps, [{ value: 0.28, time: 0.5 }]);
  scrubber.move(0.6, 0.75);
  assert.equal(scrubber.envelope.gain.ramps.length, 1);
  const voice = scrubber.voice;
  context.currentTime = 1;
  scrubber.release();
  assert.equal(scrubber.voice, null);
  assert.deepEqual(scrubber.envelope.gain.ramps.at(-1), {
    value: 0,
    time: 1.5,
  });
  assert.equal(voice.source.stopTime, 1.51);
});

test("fader audio survives UI clacks and stops with SFX off", async () => {
  const { engine } = makeEngine();
  await engine.unlock();
  const scrubber = await makeScrubber(engine);
  engine.buffers.clack = { duration: 0.15932 };
  scrubber.move(0, 0.375);
  const voice = scrubber.voice;
  await engine.sfx("clack");
  assert.equal(voice.source.stopped, 0);
  engine.sfxEnabled = false;
  engine.stopSfx();
  scrubber.move(0.2, 0.375);
  assert.equal(scrubber.voice, null);
  assert.ok(voice.source.stopTime < 0.04);
});

test("fader decoding cannot start stale sound after a stop", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.rawSfx = { neuraasliderto: new ArrayBuffer(8) };
  let finish;
  context.decodeAudioData = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const scrubber = new Scrubber(engine, async () => () => new FakeNode());
  const preparing = scrubber.prepare();
  await new Promise((resolve) => setImmediate(resolve));
  scrubber.stop();
  finish({ duration: 8 / 3 });
  await preparing;
  assert.equal(context.sources.length, 0);
});

test("ten turns charge every lamp and guarantee a surprise on each tenth turn", () => {
  const charge = new TurnCharge();
  assert.equal(charge.level, 0);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let turn = 1; turn < 10; turn++) {
      assert.equal(charge.turn(), false);
      assert.equal(charge.level, turn);
    }
    assert.equal(charge.turn(), true);
    assert.equal(charge.level, 10);
  }
});

test("blank clicks, interactive clicks and scanner sweeps retain independent tails", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  for (const name of ["clickeffect", "clickevent", "scanner", "preselect"]) {
    engine.buffers[name] = { duration: 1 };
    await engine.sfx(name);
  }
  assert.equal(context.sources.length, 4);
  assert.ok(context.sources.every((source) => !source.stopped));
  engine.stopSfx();
  assert.ok(context.sources.every((source) => source.stopped === 1));
});

test("surprise, round and detent sounds overlap independently and all obey SFX off", async () => {
  const { engine, context } = makeEngine();
  await engine.unlock();
  engine.buffers.round = { duration: 1 };
  engine.buffers.suprise = { duration: 4 / 3 };
  engine.buffers.clack = { duration: 0.159 };
  await engine.sfx("round");
  await engine.sfx("suprise");
  await engine.sfx("clack");
  assert.equal(context.sources.filter((source) => source.stopped).length, 0);
  engine.stopSfx();
  assert.equal(context.sources.filter((source) => source.stopped).length, 3);
});
