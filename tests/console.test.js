import test from "node:test";
import assert from "node:assert/strict";
import { lensSourcePoint, lensDisplayPoint } from "../src/crt.js";
import { AudioAssets, fetchCompleteAudio } from "../src/loading.js";

function streamingFetch(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let stream, signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          stream = controller;
          signal.addEventListener("abort", () =>
            controller.error(new DOMException("Aborted", "AbortError")),
          );
        },
      }),
    };
  });
  return {
    get stream() {
      return stream;
    },
    get signal() {
      return signal;
    },
  };
}

test("a progressing audio download can exceed the idle timeout without being restarted", async (t) => {
  const f = streamingFetch(t);
  const pending = fetchCompleteAudio("large.wav", 100);
  await Promise.resolve();
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(80);
    f.stream.enqueue(Uint8Array.of(i));
    await Promise.resolve();
  }
  assert.equal(f.signal.aborted, false);
  f.stream.close();
  assert.deepEqual([...new Uint8Array(await pending)], [0, 1, 2, 3]);
  t.mock.timers.tick(200);
  assert.equal(f.signal.aborted, false);
});

test("an audio download with no new bytes still times out and releases the reader", async (t) => {
  const f = streamingFetch(t);
  const pending = fetchCompleteAudio("stalled.wav", 100);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await Promise.resolve();
  t.mock.timers.tick(101);
  await rejected;
  assert.equal(f.signal.aborted, true);
});

test("CRT visible coordinates map back to the original control within a pixel", () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
  ]) {
    for (const x of [18, width / 2, width - 18]) {
      for (const y of [18, height / 2, height - 18]) {
        const display = lensDisplayPoint(x, y, width, height);
        const source = lensSourcePoint(display.x, display.y, width, height);
        assert.ok(Math.hypot(source.x - x, source.y - y) < 0.1);
      }
    }
  }
});

test("audio readiness waits for complete files and decodes UI sounds before resolving", async () => {
  const original = globalThis.fetch;
  let release;
  const fetched = [];
  const engine = {
    initialize() {},
    async decodeSfx(name) {
      return this.rawSfx[name]?.byteLength > 0;
    },
  };
  const assets = new AudioAssets(engine, (path) => path);
  globalThis.fetch = async (path) => {
    fetched.push(path);
    return {
      ok: true,
      arrayBuffer: () =>
        path === "music.mp3"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(new ArrayBuffer(8)),
    };
  };
  try {
    let ready = false;
    const loading = assets
      .load([{ src: "music.mp3" }, { src: "click.wav" }], {
        click: "click.wav",
      })
      .then(() => {
        ready = true;
      });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ready, false);
    assert.equal(fetched.filter((path) => path === "click.wav").length, 1);
    assert.ok(engine.rawSfx.click.byteLength);
    release(new ArrayBuffer(16));
    await loading;
    assert.ok(assets.url("music.mp3").startsWith("blob:"));
  } finally {
    globalThis.fetch = original;
    for (const url of assets.urls.values()) URL.revokeObjectURL(url);
  }
});

test("failed audio cannot complete loading and retry reuses successful files", async () => {
  const original = globalThis.fetch;
  const counts = {};
  let broken = true;
  const engine = {
    initialize() {},
    async decodeSfx() {
      return true;
    },
  };
  const assets = new AudioAssets(engine, (path) => path);
  globalThis.fetch = async (path) => {
    counts[path] = (counts[path] || 0) + 1;
    return {
      ok: path !== "broken.wav" || !broken,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  };
  try {
    const sounds = { click: "good.wav", scan: "broken.wav" };
    await assert.rejects(assets.load([], sounds));
    assert.equal(counts["broken.wav"], 2);
    broken = false;
    await assets.load([], sounds);
    assert.equal(counts["good.wav"], 1);
    assert.equal(assets.completed.size, 2);
  } finally {
    globalThis.fetch = original;
    for (const url of assets.urls.values()) URL.revokeObjectURL(url);
  }
});
