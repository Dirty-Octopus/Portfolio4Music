import test from "node:test";
import assert from "node:assert/strict";
import { runAssembly } from "../src/portal-assembly.js";

function setup(t) {
  const effects = [],
    order = [],
    positions = [];
  const frames = new Map(),
    listeners = new Map();
  let id = 0,
    committed = 0;
  const rect = {
    left: 40,
    right: 960,
    top: 40,
    bottom: 720,
    width: 920,
    height: 680,
  };
  function node() {
    return {
      style: {},
      children: [],
      textContent: "",
      classList: { add() {}, contains: () => false },
      setAttribute() {},
      append() {},
      remove() {
        order.push("remove");
      },
      matches: () => false,
      getBoundingClientRect: () => rect,
      querySelector: () => null,
      querySelectorAll: () => [],
      animate() {
        const effect = {
          currentTime: null,
          pause() {},
          cancel() {
            order.push("cancel");
          },
        };
        effects.push(effect);
        return effect;
      },
    };
  }
  const boot = node(),
    site = node();
  const nodes = Object.fromEntries(
    [
      ".boot-face",
      ".boot-center",
      ".boot-symbol",
      ".boot-progress",
      ".boot-rule",
      ".boot-foot",
      ".boot-grid",
      ".shell",
      ".masthead",
      ".brand-home",
      ".hero",
      ".hero-copy",
      ".workspace",
      ".transport",
    ].map((key) => [key, node()]),
  );
  boot.querySelector = site.querySelector = (selector) =>
    nodes[selector] ?? null;
  const eventTarget = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  const globals = {
    document: {
      ...eventTarget,
      body: node(),
      documentElement: node(),
      createElementNS: node,
    },
    window: eventTarget,
    innerWidth: 1000,
    innerHeight: 800,
    performance: { now: () => 0 },
    getComputedStyle: () => ({ backgroundColor: "rgb(0,0,0)" }),
    requestAnimationFrame: (handler) => {
      frames.set(++id, handler);
      return id;
    },
    cancelAnimationFrame: (key) => frames.delete(key),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() =>
      original
        ? Object.defineProperty(globalThis, key, original)
        : delete globalThis[key],
    );
  }
  const controller = runAssembly({
    boot,
    site,
    logo: {
      beginTransfer: () => order.push("begin"),
      transfer: (p) => positions.push(p),
      finishTransfer: () => order.push("land"),
    },
    onFinish: () => {
      committed++;
      order.push("commit");
    },
  });
  return {
    controller,
    effects,
    order,
    positions,
    frames,
    listeners,
    get committed() {
      return committed;
    },
    step(time) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

test("all assembly layers share a clock and commit before releasing animation ownership", (t) => {
  const f = setup(t);
  assert.ok(f.effects.length > 10);
  assert.ok(f.effects.every((effect) => effect.currentTime === 0));
  f.step(1000);
  assert.ok(f.effects.every((effect) => effect.currentTime === 1000));
  assert.equal(f.committed, 0);
  assert.ok(f.positions.at(-1) > 0 && f.positions.at(-1) < 1);
  f.step(2499);
  assert.equal(f.committed, 0);
  assert.equal(f.positions.at(-1), 1);
  f.step(2500);
  assert.equal(f.committed, 1);
  assert.ok(f.order.indexOf("commit") < f.order.indexOf("cancel"));
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  f.controller.finish();
  assert.equal(f.committed, 1);
});

test("resize or motion preference changes settle the scene without a dangling clock", (t) => {
  const f = setup(t);
  f.step(600);
  f.listeners.get("resize")();
  assert.equal(f.committed, 1);
  assert.equal(f.positions.at(-1), 1);
  assert.ok(f.effects.every((effect) => effect.currentTime === 2500));
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
});
