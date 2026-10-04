import test from "node:test";
import assert from "node:assert/strict";
import { initViewportSurface } from "../src/viewport.js";

test("portal shares the optical surface while only the archive follows restored scrolling", (t) => {
  const listeners = new Map();
  const node = (tagName, id) => ({
    tagName,
    id,
    style: {},
    children: [],
    offsetHeight: 900,
    append(...children) {
      this.children.push(...children);
      children.forEach((child) => {
        child.parentElement = this;
      });
    },
    addEventListener() {},
  });
  const boot = node("DIV", "boot"),
    site = node("DIV", "site"),
    script = node("SCRIPT");
  let loading = true;
  const body = node("BODY");
  body.children = [boot, site, script];
  body.classList = { contains: () => loading };
  const globals = {
    document: {
      body,
      documentElement: { classList: { add() {} } },
      createElement: () => node("DIV"),
      querySelector: () => site,
      addEventListener: (type, fn) => listeners.set(type, fn),
    },
    window: { addEventListener: (type, fn) => listeners.set(type, fn) },
    scrollY: 600,
    getComputedStyle: () => ({
      padding: "30px",
      paddingTop: "30px",
      paddingBottom: "30px",
    }),
    ResizeObserver: class {
      observe() {}
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
    t.after(() =>
      original
        ? Object.defineProperty(globalThis, key, original)
        : delete globalThis[key],
    );
  }
  initViewportSurface();
  assert.equal(boot.parentElement.className, "crt-surface");
  assert.equal(site.parentElement, boot.parentElement);
  assert.equal(script.parentElement, undefined);
  assert.equal(
    site.style.top,
    "0px",
    "restored scroll cannot leak the archive into the portal",
  );
  listeners.get("scroll")();
  assert.equal(site.style.top, "0px");
  loading = false;
  listeners.get("portalentered")();
  assert.equal(site.style.top, "-600px");
  assert.equal(
    boot.style.top,
    undefined,
    "scrolling never translates the portal",
  );
});
