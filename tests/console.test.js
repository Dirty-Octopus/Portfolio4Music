import test from "node:test";
import assert from "node:assert/strict";
import { lensSourcePoint, lensDisplayPoint } from "../src/crt.js";
import { AudioAssets } from "../src/loading.js";

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
