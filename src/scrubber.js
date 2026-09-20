import { clamp } from "./player.js";

function ramp(param, value, now, duration) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
  }
  param.linearRampToValueAtTime(value, now + duration);
}

export class Scrubber {
  constructor(
    engine,
    load = async (context) =>
      (await import("./soundtouch.js")).prepareStretch(context),
  ) {
    this.engine = engine;
    this.load = load;
    this.voices = new Set();
    this.voice = null;
    this.moving = false;
  }
  async prepare() {
    if (!this.engine.context) return;
    this.ready ??= (async () => {
      this.factory = await this.load(this.engine.context);
      this.envelope = this.engine.context.createGain();
      this.envelope.gain.value = 0;
      this.envelope.connect(this.engine.master);
    })().catch((error) => {
      this.ready = null;
      throw error;
    });
    await this.ready;
    await Promise.all([
      this.engine.decodeSfx("neuraasliderto"),
      this.engine.decodeSfx("neuraasliderfrom"),
    ]);
  }
  move(position, velocity) {
    const { engine } = this;
    if (!engine.sfxEnabled || !this.factory || Math.abs(velocity) < 0.002)
      return;
    const name = velocity > 0 ? "neuraasliderto" : "neuraasliderfrom";
    const buffer = engine.buffers[name];
    if (!buffer) return;
    const now = engine.context.currentTime;
    const offset =
      clamp(velocity > 0 ? position : 1 - position, 0, 1) * buffer.duration;
    const rate = clamp(Math.abs(velocity) * buffer.duration, 0.1, 8);
    if (!this.moving) {
      ramp(this.envelope.gain, 0.28, now, 0.5);
      this.moving = true;
    }
    let voice = this.voice;
    const expected = voice ? voice.offset + (now - voice.at) * voice.rate : 0;
    // Continuous stretches preserve phase; only direction changes and seeks crossfade.
    if (!voice || voice.name !== name || Math.abs(expected - offset) > 0.07) {
      if (voice) this.retire(voice, 0.06);
      const source = engine.context.createBufferSource();
      const processor = this.factory();
      const gain = engine.context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      processor.playbackRate.value = rate;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.06);
      source.connect(processor);
      processor.connect(gain);
      gain.connect(this.envelope);
      voice = {
        source,
        processor,
        gain,
        name,
        offset,
        at: now,
        rate,
        retired: false,
      };
      this.voice = voice;
      this.voices.add(voice);
      source.onended = () => {
        if (this.voice === voice) this.voice = null;
        // Let the processor's overlap window drain before releasing its graph.
        setTimeout(() => {
          source.disconnect();
          processor.disconnect();
          processor.port?.close();
          gain.disconnect();
          this.voices.delete(voice);
        }, 120);
      };
      source.start(now, Math.min(offset, buffer.duration - 0.001));
    } else {
      voice.offset = expected;
      voice.at = now;
      voice.rate = rate;
      voice.source.playbackRate.setValueAtTime(rate, now);
      voice.processor.playbackRate.setValueAtTime(rate, now);
    }
  }
  retire(voice, seconds) {
    const now = this.engine.context.currentTime;
    ramp(voice.gain.gain, 0, now, seconds);
    voice.source.stop(now + seconds + 0.01);
    voice.retired = true;
  }
  release(seconds = 0.5) {
    if (!this.envelope) return;
    ramp(this.envelope.gain, 0, this.engine.context.currentTime, seconds);
    if (this.voice) this.retire(this.voice, seconds);
    this.voice = null;
    this.moving = false;
  }
  stop() {
    this.release(0.025);
    for (const voice of this.voices) this.retire(voice, 0.025);
  }
}
