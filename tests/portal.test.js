import test from "node:test";
import assert from "node:assert/strict";
import { initPortal } from "../src/portal.js";

function fixture(
  t,
  { motion = true, audio = "running", userAgent = "Chrome/130.0" } = {},
) {
  const animations = [];
  const frames = [];
  const sounds = [];
  const scrolls = [];
  const events = [];
  const node = () => {
    const classes = new Set();
    const listeners = new Map();
    return {
      hidden: false,
      disabled: false,
      inert: false,
      style: {},
      dataset: {},
      children: [],
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
      },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
      dispatch: (name) => listeners.get(name)?.(),
      getBoundingClientRect: () => ({
        left: 20,
        top: 20,
        width: 120,
        height: 100,
      }),
      getAnimations: () => [],
      animate() {
        let finish;
        const finished = new Promise((resolve) => {
          finish = resolve;
        });
        animations.push(finish);
        return { finished };
      },
    };
  };
  const boot = node();
  const entry = node();
  const buttons = [node(), node()];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  entry.inert = true;
  entry.querySelectorAll = () => buttons;
  const loader = node();
  const notice = node();
  const logo = node();
  const face = node();
  const center = node();
  center.children = [logo, node(), node()];
  const map = {
    ".language-entry": entry,
    ".portal-loader": loader,
    ".browser-notice": notice,
    ".boot-face": face,
    ".boot-symbol": logo,
    ".boot-center": center,
    ".portal-field": node(),
    ".boot-rule": node(),
    ".boot-foot": node(),
  };
  boot.querySelector = (selector) => map[selector];
  const site = node();
  site.inert = true;
  site.style.top = "-900px";
  site.querySelector = () => node();
  site.querySelectorAll = () => [node(), node(), node()];
  const body = node();
  body.classList.add("boot-visible");
  const engine = {
    context: { state: audio },
    sfx: (name) => sounds.push(name),
    unlock: async () => {
      engine.context.state = "running";
    },
  };
  const globals = {
    document: {
      body,
      querySelector: (selector) => (selector === "#boot" ? boot : site),
      dispatchEvent: (event) => {
        events.push(event.type);
      },
    },
    window: { scrollTo: (options) => scrolls.push(options) },
    history: { scrollRestoration: "auto" },
    navigator: { userAgent },
    devicePixelRatio: 1,
    performance: { now: () => 0 },
    getComputedStyle: () => ({ getPropertyValue: () => "#fff100" }),
    setTimeout: (callback) => {
      queueMicrotask(callback);
    },
    requestAnimationFrame: (callback) => {
      frames.push(callback);
    },
  };
  const originals = new Map();
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const portal = initPortal({ engine, motionAllowed: () => motion });
  return {
    portal,
    boot,
    entry,
    buttons,
    loader,
    notice,
    site,
    body,
    sounds,
    scrolls,
    events,
    animations,
    frames,
  };
}

test("language choices stay disabled until the entire panel reveal finishes", async (t) => {
  const f = fixture(t);
  assert.equal(f.portal.ready, false);
  assert.equal(f.entry.inert, true);
  const reveal = f.portal.reveal();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.portal.ready, false);
  assert.ok(f.buttons.every((button) => button.disabled));
  // Finish the visual animation, while the final button is still travelling.

  const finalButton = f.animations.pop();
  f.animations.splice(0).forEach((finish) => finish());
  await Promise.resolve();
  assert.equal(f.portal.ready, false);
  assert.equal(f.entry.inert, true);
  finalButton();
  await reveal;
  assert.equal(f.portal.ready, true);
  assert.ok(f.buttons.every((button) => !button.disabled));
  assert.equal(f.entry.inert, false);
  assert.equal(f.loader.hidden, true);
});

test("reduced-motion entry clears portal isolation without waiting for animation callbacks", async (t) => {
  const f = fixture(t, { motion: false });
  await f.portal.reveal();
  assert.equal(f.portal.ready, true);
  await f.portal.enter();
  assert.equal(f.boot.hidden, true);
  assert.equal(f.site.inert, false);
  assert.equal(f.site.style.top, "0px");
  assert.equal(f.body.classList.contains("boot-visible"), false);
  assert.equal(f.body.classList.contains("portal-opening"), false);
  assert.deepEqual(f.events, ["portalentered"]);
  assert.equal(f.frames.length, 0);
  assert.equal(f.animations.length, 0);
});

test("a suspended audio context delays the ready cue until a real portal gesture", async (t) => {
  const f = fixture(t, { motion: false, audio: "suspended" });
  await f.portal.reveal();
  assert.deepEqual(f.sounds, []);
  f.boot.dispatch("keydown");
  await Promise.resolve();
  assert.deepEqual(f.sounds, ["flicker"]);
  f.boot.dispatch("pointerdown");
  await Promise.resolve();
  assert.deepEqual(f.sounds, ["flicker"]);
});

test("reload resets restored scrolling and a WebKit browser receives the compatibility note", (t) => {
  const f = fixture(t, {
    userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  });
  assert.equal(globalThis.history.scrollRestoration, "manual");
  assert.deepEqual(f.scrolls, [{ top: 0, behavior: "instant" }]);
  assert.equal(f.notice.hidden, false);
});

test("Chromium receives no browser compatibility notice", (t) => {
  const f = fixture(t);
  assert.equal(f.notice.hidden, true);
});
