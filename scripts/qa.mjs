#!/usr/bin/env node
/** Headless acceptance checks for the portfolio: playback, exclusivity, seeking,
 * interface SFX, boot flow, responsive layout. Zero dependencies: drives an
 * installed Chrome over the DevTools protocol.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { lensDisplayPoint } from "../src/crt.js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const QA_DIR = join(ROOT, ".qa");
const PORT = Number(process.env.QA_PORT || 5199);
const DEBUG_PORT = Number(process.env.QA_DEBUG_PORT || 9333);
const BASE = process.env.QA_URL || `http://127.0.0.1:${PORT}/`;
const REMOTE = Boolean(process.env.QA_URL);
const CHROME =
  process.env.CHROME ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].find((candidate) => existsSync(candidate));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`,
  );
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      for (const handler of this.handlers.get(message.method) || [])
        handler(message.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, handler) {
    const list = this.handlers.get(method) || [];
    list.push(handler);
    this.handlers.set(method, list);
  }
  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${method} timed out`)),
        timeout,
      );
      const handler = (params) => {
        clearTimeout(timer);
        this.handlers.set(
          method,
          (this.handlers.get(method) || []).filter((h) => h !== handler),
        );
        resolve(params);
      };
      this.on(method, handler);
    });
  }
  close() {
    this.ws.close();
  }
}

const sleepMs = (ms) => sleep(ms);
const errors = [];
const badResponses = [];
const resources = { vite: null, chrome: null, cdp: null, profile: null };
function cleanup() {
  resources.cdp?.close();
  resources.chrome?.kill("SIGKILL");
  if (resources.vite?.pid) {
    try {
      process.kill(-resources.vite.pid, "SIGKILL");
    } catch {
      /* Already stopped. */
    }
  }
  if (resources.profile)
    rmSync(resources.profile, { recursive: true, force: true });
}

async function main() {
  if (!CHROME) throw new Error("Chrome not found; set CHROME=/path/to/chrome");
  mkdirSync(QA_DIR, { recursive: true });

  let vite = null;
  if (REMOTE) {
    console.log(`· checking remote site ${BASE}`);
  } else {
    const preview = process.env.QA_PREVIEW === "1";
    if (preview) {
      console.log("· building production bundle");
      await run("npx", ["vite", "build"]);
    }
    console.log(
      preview ? "· starting Vite preview server" : "· starting Vite dev server",
    );
    const viteArgs = [
      "vite",
      preview ? "preview" : "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ];
    try {
      await fetch(BASE);
      throw new Error(
        `QA port ${PORT} is already in use; choose another QA_PORT`,
      );
    } catch (error) {
      if (!error.cause) throw error;
    }
    vite = spawn("npx", viteArgs, {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
    });
    resources.vite = vite;
  }
  await waitForHttp(BASE, 40000);

  console.log("· starting headless Chrome");
  const profile = join(tmpdir(), `portfolio-qa-${Date.now()}`);
  resources.profile = profile;
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--window-size=1440,980",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const target = await waitForTarget(DEBUG_PORT, 20000);
  resources.chrome = chrome;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const cdp = new CDP(ws);
  resources.cdp = cdp;
  cdp.on("Runtime.exceptionThrown", (params) =>
    errors.push(params.exceptionDetails?.text || "exception"),
  );
  cdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error")
      errors.push(params.args.map((a) => a.value ?? a.description).join(" "));
  });
  cdp.on("Network.responseReceived", (params) => {
    if (params.response.status >= 400)
      badResponses.push(`${params.response.status} ${params.response.url}`);
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: qaHook });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluate = async (expression, awaitPromise = true) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description || exceptionDetails.text,
      );
    return result.value;
  };
  const scrollTo = (selector) =>
    evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`,
    );
  const boxOf = async (selector) => {
    await scrollTo(selector);
    await sleepMs(120);
    return evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
    );
  };
  const click = async (selector) => {
    const box = await boxOf(selector);
    if (!box) throw new Error(`missing element ${selector}`);
    let x = box.x + box.w / 2,
      y = box.y + box.h / 2;
    const viewport = await evaluate(
      `({ width: document.documentElement.clientWidth, height: innerHeight, crt: document.documentElement.classList.contains('crt-mode') })`,
    );
    if (viewport.crt)
      ({ x, y } = lensDisplayPoint(x, y, viewport.width, viewport.height));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
      buttons: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
      buttons: 0,
    });
  };
  const drag = async (selector, from, to) => {
    const box = await boxOf(selector);
    if (!box) throw new Error(`missing element ${selector}`);
    const y = box.y + box.h / 2;
    const x1 = box.x + box.w * from,
      x2 = box.x + box.w * to;
    const viewport = await evaluate(
      `({ width: document.documentElement.clientWidth, height: innerHeight, crt: document.documentElement.classList.contains('crt-mode') })`,
    );
    const point = (x) =>
      viewport.crt
        ? lensDisplayPoint(x, y, viewport.width, viewport.height)
        : { x, y };
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point(x1),
      button: "left",
      clickCount: 1,
      buttons: 1,
    });
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...point(x1 + ((x2 - x1) * i) / 6),
        button: "left",
        buttons: 1,
      });
      await sleepMs(16);
    }
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point(x2),
      button: "left",
      clickCount: 1,
      buttons: 0,
    });
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(join(QA_DIR, `${name}.png`), Buffer.from(data, "base64"));
  };
  const waitFor = async (expression, timeout = 8000, label = expression) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return true;
      await sleepMs(100);
    }
    throw new Error(`timeout waiting for ${label}`);
  };

  console.log("· loading page");
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: BASE });
  await loaded;
  await sleepMs(900);
  await shot("01-boot");

  check(
    "boot overlay is shown first",
    await evaluate(
      `getComputedStyle(document.querySelector('#boot')).display !== 'none'`,
    ),
  );
  check(
    "site is inert behind the boot overlay",
    await evaluate(`document.querySelector('#site').inert === true`),
  );
  check(
    "manifest renders 16 audio tracks",
    (await evaluate(`document.querySelectorAll('.track').length`)) === 16,
  );
  check(
    "all 6 filters render",
    (await evaluate(`document.querySelectorAll('.filter').length`)) === 6,
  );
  check(
    "entry offers Chinese and English",
    await evaluate(`document.querySelectorAll('[data-enter]').length === 2`),
  );

  console.log("· entering the experience");
  await click("#enter");
  await waitFor(
    `document.querySelector('#boot').classList.contains('booting')`,
  );
  await waitFor(`document.querySelectorAll('.boot-leaf').length === 2`, 30000);
  check(
    "the valve waits for the complete audio archive",
    await evaluate(
      `document.querySelector('.boot-progress').getAttribute('aria-valuenow') === '100' && document.querySelector('#audio').src.startsWith('blob:')`,
    ),
  );
  await sleepMs(200);
  await shot("20-valve-opening");
  await sleepMs(180);
  await shot("14-crt-ignition");
  await waitFor(
    `document.querySelector('#boot').hidden === true`,
    30000,
    "boot dismissal",
  );
  await sleepMs(2200);
  check(
    "site becomes interactive after entering",
    await evaluate(`document.querySelector('#site').inert === false`),
  );
  const sfxAfterEnter = await evaluate(`window.__qa.sfxStarts`);
  check(
    "CRT power-on cue plays once on entry",
    sfxAfterEnter.filter(
      (source) => !source.loop && Math.abs(source.duration - 1) < 0.002,
    ).length === 1,
    `voices=${sfxAfterEnter.length}`,
  );
  const flickers = sfxAfterEnter.filter(
    (source) => Math.abs(source.duration - 1.364127) < 0.002,
  );
  check(
    "bright flicker plays once with its full natural tail",
    flickers.length === 1 &&
      !flickers[0].loop &&
      !flickers[0].stoppedAt &&
      flickers[0].endedAt - flickers[0].at >= 1250,
  );
  check(
    "flicker follows the CRT startup as a separate reveal cue",
    flickers[0]?.at - sfxAfterEnter[0]?.at >= 2900,
  );
  const blankStart = await evaluate(`window.__qa.sfxStarts.length`);
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: 8,
      y: 350,
      button: "left",
      clickCount: 1,
      buttons: type === "mousePressed" ? 1 : 0,
    });
  await sleepMs(50);
  const blankSounds = await evaluate(
    `window.__qa.sfxStarts.slice(${blankStart}).map(s=>s.duration)`,
  );
  check(
    "blank clicks play only the universal click effect",
    blankSounds.length === 1 && Math.abs(blankSounds[0] - 0.208345) < 0.002,
    JSON.stringify(blankSounds),
  );
  check(
    "navigation and hero have shaped silhouettes",
    await evaluate(`
    ['.nav', '.hero'].every(selector => getComputedStyle(document.querySelector(selector)).clipPath.startsWith('polygon'))
  `),
  );
  const motionBefore = await evaluate(`({
    trace: getComputedStyle(document.querySelector('.contour-trace')).strokeDashoffset,
    rail: getComputedStyle(document.querySelector('.chassis-bridge')).height
  })`);
  await sleepMs(600);
  check(
    "structured contour traces remain animated without random texture fins",
    await evaluate(`
    !document.querySelector('.signal-fin,.signal-slit') &&
    getComputedStyle(document.querySelector('.contour-trace')).strokeDashoffset !== ${JSON.stringify(motionBefore.trace)}
  `),
  );
  check(
    "banner contours are linework, never opaque filled patches",
    await evaluate(
      `getComputedStyle(document.querySelector('.signal-contour')).fill === 'none'`,
    ),
  );
  check(
    "pad starts in a continuous loop by default",
    sfxAfterEnter.some(
      (source) => source.loop && Math.abs(source.duration - 60) < 0.1,
    ),
  );
  check(
    "Chinese entry localizes content",
    await evaluate(
      `document.documentElement.lang === 'zh-CN' && document.querySelector('#current-title').textContent === '管弦乐创作'`,
    ),
  );
  const hoverBox = await boxOf('[data-nav="audio"]');
  const beforeHover = await evaluate(`window.__qa.sfxStarts.length`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: hoverBox.x + 20,
    y: hoverBox.y + 20,
  });
  await sleepMs(300);
  check(
    "preselection triggers its own sound",
    await evaluate(
      `window.__qa.sfxStarts.length > ${beforeHover} && window.__qa.sfxStarts.at(-1).duration < 1`,
    ),
  );
  const fastHovers = await evaluate(`(async () => {
    const before = window.__qa.sfxStarts.filter(s => Math.abs(s.duration - .166667) < .002).length;
    for (const button of document.querySelectorAll('.nav')) {
      button.dispatchEvent(new PointerEvent('pointerover', {bubbles:true,pointerType:'mouse'}));
      await new Promise(resolve => setTimeout(resolve,20));
    }
    return window.__qa.sfxStarts.filter(s => Math.abs(s.duration - .166667) < .002).length - before;
  })()`);
  check(
    "rapid preselection retriggers across all four controls",
    fastHovers === 4,
  );
  await click("#sfx-toggle");
  const beforeSilentHover = await evaluate(`window.__qa.sfxStarts.length`);
  const hoverVideoBox = await boxOf('[data-nav="video"]');
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: hoverVideoBox.x + 20,
    y: hoverVideoBox.y + 20,
  });
  await sleepMs(200);
  check(
    "SFX off silences preselection while BGM stays enabled",
    await evaluate(
      `window.__qa.sfxStarts.length === ${beforeSilentHover} && document.querySelector('#bgm-toggle').getAttribute('aria-pressed') === 'true'`,
    ),
  );
  await click("#bgm-toggle");
  check(
    "BGM can be disabled separately",
    await evaluate(
      `document.querySelector('#bgm-toggle').getAttribute('aria-pressed') === 'false'`,
    ),
  );
  await click("#bgm-toggle");
  await sleepMs(200);
  check(
    "BGM restarts while SFX remains off",
    await evaluate(
      `window.__qa.sfxStarts.filter(source => source.loop).length === 2 && document.querySelector('#sfx-toggle').getAttribute('aria-pressed') === 'false'`,
    ),
  );
  await click("#sfx-toggle");
  await shot("02-main");
  check(
    "overview contains the personal biography instead of the archive grid",
    await evaluate(`
    document.querySelector('.biography').offsetWidth > 0 && document.querySelector('.audio-library').offsetWidth === 0 &&
    document.querySelector('.biography').textContent.includes('Biobyte Studio')
  `),
  );
  check(
    "transport is a fixed dock outside the animated shell",
    await evaluate(`
    getComputedStyle(document.querySelector('.transport')).position === 'fixed' && !document.querySelector('.shell .transport')
  `),
  );

  await click('[data-nav="audio"]');
  await waitFor(
    `document.querySelector('.shell').dataset.view === 'audio' && !document.querySelector('.workspace').inert`,
  );

  console.log("· playback checks");
  check(
    "new visitors see the compact player first",
    await evaluate(
      `document.querySelector('.transport').classList.contains('collapsed')`,
    ),
  );
  await click("#dock-toggle");
  await click(".track");
  await sleepMs(600);
  check(
    "clicking a track starts audio playback",
    await evaluate(`!document.querySelector('#audio').paused`),
  );
  check(
    "player shows the selected track",
    await evaluate(
      `document.querySelector('#current-title').textContent.length > 0 && document.querySelector('#play-state').textContent.includes('播放')`,
    ),
  );
  check(
    "disc animates while playing",
    await evaluate(
      `document.querySelector('#disc').classList.contains('spinning')`,
    ),
  );
  const seekA = await evaluate(`document.querySelector('#audio').currentTime`);
  await sleepMs(1400);
  const seekB = await evaluate(`document.querySelector('#audio').currentTime`);
  check(
    "audio position advances",
    seekB > seekA + 0.5,
    `${seekA.toFixed(2)}s → ${seekB.toFixed(2)}s`,
  );
  const clicks = await evaluate(`window.__qa.sfxStarts.length`);
  check(
    "clicking a control plays the interface SFX",
    clicks > sfxAfterEnter.length,
    `voices=${clicks}`,
  );
  const lastSfx = await evaluate(
    `window.__qa.sfxStarts[window.__qa.sfxStarts.length - 1].duration`,
  );
  check(
    "interface SFX is the short click, not the notification",
    lastSfx < 1,
    `${Number(lastSfx).toFixed(2)}s`,
  );

  console.log("· drag the audio progress bar");
  await drag("#audio-seek", 0.15, 0.72);
  await sleepMs(700);
  const audioAfterDrag = await evaluate(
    `(() => { const a = document.querySelector('#audio'); return { time: a.currentTime, duration: a.duration, paused: a.paused }; })()`,
  );
  check(
    "audio seek follows the drag",
    Math.abs(audioAfterDrag.time / audioAfterDrag.duration - 0.72) < 0.06,
    `${((audioAfterDrag.time / audioAfterDrag.duration) * 100).toFixed(1)}%`,
  );
  check("audio keeps playing after the drag", audioAfterDrag.paused === false);
  await shot("03-audio-playing");

  console.log("· video playback and exclusivity");
  await click('[data-nav="video"]');
  await waitFor(
    `document.querySelector('.shell').dataset.view === 'video' && !document.querySelector('.workspace').inert`,
  );
  await click("#video-overlay");
  await sleepMs(900);
  check(
    "video plays from the overlay",
    await evaluate(`!document.querySelector('#video').paused`),
  );
  check(
    "starting video pauses audio (no overlap)",
    await evaluate(`document.querySelector('#audio').paused === true`),
  );
  check(
    "video stage switches to playing state",
    await evaluate(
      `document.querySelector('#video-stage').classList.contains('is-playing')`,
    ),
  );
  const vA = await evaluate(`document.querySelector('#video').currentTime`);
  await sleepMs(1200);
  const vB = await evaluate(`document.querySelector('#video').currentTime`);
  check(
    "video position advances",
    vB > vA + 0.4,
    `${vA.toFixed(2)}s → ${vB.toFixed(2)}s`,
  );
  await shot("04-video-playing");

  console.log("· drag the video progress bar");
  await drag("#video-seek", 0.1, 0.55);
  await sleepMs(900);
  const videoAfterDrag = await evaluate(
    `(() => { const v = document.querySelector('#video'); return { time: v.currentTime, duration: v.duration, paused: v.paused }; })()`,
  );
  check(
    "video seek follows the drag",
    Math.abs(videoAfterDrag.time / videoAfterDrag.duration - 0.55) < 0.06,
    `${((videoAfterDrag.time / videoAfterDrag.duration) * 100).toFixed(1)}%`,
  );
  check("video keeps playing after the drag", videoAfterDrag.paused === false);

  console.log("· switching back to audio");
  await click("#audio-play");
  await sleepMs(800);
  check(
    "audio resumes and pauses video",
    await evaluate(
      `!document.querySelector('#audio').paused && document.querySelector('#video').paused`,
    ),
  );

  console.log("· keyboard shortcuts");
  await evaluate(`document.activeElement && document.activeElement.blur()`);
  await sleepMs(200);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await sleepMs(400);
  check(
    "space bar pauses playback",
    await evaluate(`document.querySelector('#audio').paused`),
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "/",
    code: "Slash",
    windowsVirtualKeyCode: 191,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "/",
    code: "Slash",
    windowsVirtualKeyCode: 191,
  });
  await sleepMs(1800);
  check(
    "slash focuses the search field",
    await evaluate(
      `document.activeElement === document.querySelector('#search')`,
    ),
  );
  await cdp.send("Input.insertText", { text: "凯尔特" });
  await sleepMs(500);
  check(
    "search narrows the track list",
    (await evaluate(`document.querySelectorAll('.track').length`)) === 2,
  );
  await evaluate(
    `(() => { const input = document.querySelector('#search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); })()`,
  );
  await sleepMs(400);

  console.log("· filters, loop, volume");
  await evaluate(
    `[...document.querySelectorAll('.filter')].find(b => b.dataset.category === 'game').click()`,
  );
  await sleepMs(400);
  check(
    "category filter narrows the list",
    (await evaluate(`document.querySelectorAll('.track').length`)) === 4,
  );
  await evaluate(
    `[...document.querySelectorAll('.filter')].find(b => b.dataset.category === 'all').click()`,
  );
  await sleepMs(300);
  await click("#loop");
  await sleepMs(300);
  check(
    "loop toggle reports its state",
    await evaluate(
      `document.querySelector('#loop').getAttribute('aria-pressed') === 'true' && document.querySelector('#toast').textContent.includes('单曲循环')`,
    ),
  );
  await click("#loop");
  await click("#mute");
  await sleepMs(300);
  check(
    "mute updates the master output label",
    await evaluate(
      `document.querySelector('#volume-value').textContent === '静音'`,
    ),
  );
  await click("#mute");

  console.log("· view morphs, language and settings");
  const scansBefore = await evaluate(
    `window.__qa.sfxStarts.filter(s=>Math.abs(s.duration-.967914)<.002).length`,
  );
  await click('[data-nav="overview"]');
  await sleepMs(420);
  check(
    "tab transitions play the scanner accent",
    await evaluate(
      `window.__qa.sfxStarts.filter(s=>Math.abs(s.duration-.967914)<.002).length === ${scansBefore + 1}`,
    ),
  );
  check(
    "the whole content plane animates as one continuous surface",
    await evaluate(
      `document.querySelector('.workspace').inert && document.querySelector('.shell').dataset.view === 'audio' && !document.querySelector('.module-shutter')`,
    ),
  );
  await shot("06-morph");
  await waitFor(`document.querySelector('.shell').dataset.view === 'overview'`);
  await sleepMs(1800);
  check(
    "transition completes without a blocking shutter",
    await evaluate(`!document.querySelector('.workspace').inert`),
  );
  await shot("07-audio-view");
  await click('[data-nav="video"]');
  await waitFor(
    `document.querySelector('.module-wipe i').getAnimations()[0]?.currentTime > 100`,
  );
  const retarget = await evaluate(`(() => {
    const workspace = document.querySelector('.module-wipe i');
    const animation = workspace.getAnimations()[0];
    const before = animation.currentTime;
    document.querySelector('[data-nav="fun"]').click();
    const after = workspace.getAnimations()[0];
    return { sameAnimation: animation === after, before, after: after.currentTime };
  })()`);
  check(
    "a new destination preserves the running transition position",
    retarget.sameAnimation &&
      Math.abs(retarget.after - retarget.before) < 1 &&
      retarget.after > 100,
    JSON.stringify(retarget),
  );
  await waitFor(`document.querySelector('.shell').dataset.view === 'fun'`);
  check(
    "banner is hidden outside the profile",
    await evaluate(
      `getComputedStyle(document.querySelector('.hero')).display === 'none'`,
    ),
  );
  await sleepMs(220);
  const reversal = await evaluate(`(() => {
    const workspace = document.querySelector('.module-wipe i');
    const animation = workspace.getAnimations()[0];
    const before = animation.currentTime;
    document.querySelector('[data-nav="audio"]').click();
    const after = workspace.getAnimations()[0];
    return { sameAnimation: animation === after, before, after: after.currentTime };
  })()`);
  check(
    "navigation during reveal keeps the current sweep running",
    reversal.sameAnimation && Math.abs(reversal.after - reversal.before) < 1,
    JSON.stringify(reversal),
  );
  await evaluate(`document.querySelector('[data-nav="fun"]').click()`);
  await waitFor(
    `document.querySelector('.shell').dataset.view === 'fun' && !document.querySelector('.workspace').inert`,
  );
  await sleepMs(1800);
  check(
    "rapid navigation settles on the latest destination",
    await evaluate(
      `document.querySelector('.nav.active').dataset.nav === 'fun' && !document.querySelector('.workspace').inert`,
    ),
  );
  check(
    "navigation does not retrigger the one-shot flicker sound",
    await evaluate(`
    window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1.364127) < .002).length === 1
  `),
  );
  console.log("· rotary motion and tactile feedback");
  const knob = await boxOf("#rotary-knob");
  const cx = knob.x + knob.w / 2,
    cy = knob.y + knob.h / 2;
  const roundsBefore = await evaluate(
    `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1) < .002).length`,
  );
  const rotaryBefore = await evaluate(
    `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1/6) < .002).length`,
  );
  const scrollBeforeRotary = await evaluate(
    `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - .15932) < .002).length`,
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: cx + 55,
    y: cy,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let i = 1; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: cx + Math.cos(angle) * 55,
      y: cy + Math.sin(angle) * 55,
      button: "left",
      buttons: 1,
    });
    await sleepMs(20);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: cx + 55,
    y: cy,
    button: "left",
    buttons: 0,
  });
  await sleepMs(350);
  check(
    "one full rotary turn triggers one round accent",
    await evaluate(
      `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1) < .002).length === ${roundsBefore + 1}`,
    ),
  );
  check(
    "rotary emits actual canvas particles",
    await evaluate(
      `(() => { const c = document.querySelector('#rotary-particles'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; return d.some((v,i) => i % 4 === 3 && v > 0); })()`,
    ),
  );
  check(
    "rotary uses the original clack once per coarse detent",
    await evaluate(
      `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - .15932) < .002).length === ${scrollBeforeRotary + 12} && window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1/6) < .002).length === ${rotaryBefore}`,
    ),
  );
  check(
    "rotary displays twelve detents",
    await evaluate(
      `document.querySelectorAll('.rotary-ticks i').length === 12`,
    ),
  );
  await shot("08-playground");
  await evaluate(`document.querySelector('#rotary-knob').focus()`);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const rotaryAtStart = await evaluate(
    `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow'))`,
  );
  await sleepMs(70);
  const rotaryDuring = await evaluate(
    `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow'))`,
  );
  check(
    "rotary eases through intermediate angles",
    rotaryDuring > rotaryAtStart && rotaryDuring < 30,
  );
  await sleepMs(550);
  check(
    "rotary supports keyboard detents",
    await evaluate(
      `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')) === 30`,
    ),
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: cx + 55,
    y: cy,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  const dragRotary = async (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: cx + Math.cos(radians) * 55,
      y: cy + Math.sin(radians) * 55,
      button: "left",
      buttons: 1,
    });
    await sleepMs(450);
  };
  await dragRotary(17);
  check(
    "rotary holds its notch until the resistance threshold",
    await evaluate(
      `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')) === 30`,
    ),
  );
  await dragRotary(20);
  check(
    "rotary snaps into the next notch after the threshold",
    await evaluate(
      `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')) === 60`,
    ),
    `angle=${await evaluate(`document.querySelector('#rotary-knob').getAttribute('aria-valuenow')`)}`,
  );
  await dragRotary(14);
  check(
    "small reversals do not chatter between rotary detents",
    await evaluate(
      `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')) === 60`,
    ),
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: cx + 55,
    y: cy,
    button: "left",
    buttons: 0,
  });
  console.log("· direct fader and SoundTouch stretching");
  await evaluate(
    `window.__qa.emojis = []; document.querySelector('#rotary-knob').focus()`,
  );
  // First turn plus two notches already completed above; finish the tenth turn.
  for (let turn = 0; turn < 9; turn++) {
    await evaluate(
      `{ const knob = document.querySelector('#rotary-knob'); for(let i=0;i<${turn === 0 ? 10 : 12};i++) knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})); }`,
    );
    await sleepMs(620);
  }
  check(
    "tenth revolution fills all ten lamps",
    await evaluate(
      `document.querySelector('.crank-charge').getAttribute('aria-valuenow') === '10' && document.querySelectorAll('.crank-charge i.lit').length === 10`,
    ),
  );
  check(
    "emoji fireworks mix many distinct yellow faces",
    await evaluate(`new Set(window.__qa.emojis).size >= 12`),
  );
  await shot("21-charged-crank");
  check(
    "fader occupies its own module below the rotary",
    await evaluate(
      `document.querySelector('.fader-module').getBoundingClientRect().top > document.querySelector('.rotary-stage').getBoundingClientRect().bottom + 20`,
    ),
  );
  const fader = await boxOf(".fader-travel");
  const setFader = async (value) => {
    const x = fader.x + fader.w * value,
      y = fader.y + 80;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
    });
  };
  await setFader(0.2);
  await sleepMs(600);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: fader.x + fader.w * 0.2,
    y: fader.y + 80,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  const moveFader = async (from, to, steps, delay) => {
    for (let i = 1; i <= steps; i++) {
      await sleepMs(delay);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: fader.x + fader.w * (from + ((to - from) * i) / steps),
        y: fader.y + 80,
        button: "left",
        buttons: 1,
      });
    }
  };
  await moveFader(0.2, 0.5, 30, 65);
  const slowRate = await evaluate(
    `window.__qa.sources.filter(s => s.__processor).at(-1)?.playbackRate.value`,
  );
  check(
    "fader follows the handle directly with no trailing projection",
    await evaluate(
      `Number(document.querySelector('#neuraa-slider').getAttribute('aria-valuenow')) === 50 && !document.querySelector('.fader-projection')`,
    ),
  );
  check(
    "SoundTouch produces nonzero audio on the rendering thread",
    await evaluate(`window.__qa.stretchPeak > .001`),
  );
  await moveFader(0.5, 0.85, 12, 16);
  const fastRate = await evaluate(
    `window.__qa.sources.filter(s => s.__processor).at(-1)?.playbackRate.value`,
  );
  check(
    "drag velocity changes tempo with pitch held at unity",
    fastRate > slowRate * 2 &&
      (await evaluate(
        `window.__qa.sources.filter(s => s.__processor).every(s => s.__processor.pitch.value === 1)`,
      )),
    `${slowRate} / ${fastRate}`,
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: fader.x + fader.w * 0.75,
    y: fader.y + 80,
    button: "left",
    buttons: 1,
  });
  const reverseSound = await evaluate(
    `window.__qa.sfxStarts.filter(s => Math.abs(s.duration - 8/3) < .002).at(-1)`,
  );
  check(
    "fader reversals seek to the mirrored handle position",
    reverseSound && Math.abs(reverseSound.offset - (0.25 * 8) / 3) < 0.015,
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: fader.x + fader.w * 0.75,
    y: fader.y + 80,
    button: "left",
    buttons: 0,
  });
  check(
    "fader releases through a half-second stop buffer",
    await evaluate(
      `(() => { const s=window.__qa.sfxStarts.filter(s=>Math.abs(s.duration-8/3)<.002).at(-1); return s.stopDelay>=.5 && s.stopDelay<.53; })()`,
    ),
  );
  await sleepMs(700);
  check(
    "fader voices finish after release",
    await evaluate(
      `window.__qa.sfxStarts.filter(s => Math.abs(s.duration - 8/3) < .002).every(s => s.endedAt)`,
    ),
  );
  await shot("16-fader-desktop");
  await evaluate(
    `window.scrollTo({top:0,behavior:'instant'}); document.activeElement.blur()`,
  );
  const scrollClacks = await evaluate(
    `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1/6) < .002).length`,
  );
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 40,
    y: 300,
    deltaX: 0,
    deltaY: 72,
  });
  await waitFor(`scrollY > 0 && scrollY % 56 === 0`, 4000).catch(() => {});
  check(
    "wheel scrolling lands on a mechanical detent",
    await evaluate(`scrollY > 0 && scrollY % 56 === 0`),
    JSON.stringify(
      await evaluate(`({y:scrollY,events:window.__qa.gestures.slice(-20)})`),
    ),
  );
  check(
    "scroll detents produce lowerclack feedback",
    await evaluate(
      `window.__qa.sfxStarts.filter(source => Math.abs(source.duration - 1/6) < .002).length > ${scrollClacks}`,
    ),
  );
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await sleepMs(100);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 40,
    y: 300,
    deltaX: 0,
    deltaY: 60,
  });
  await sleepMs(100);
  const slowScroll = await evaluate(`scrollY`);
  await waitFor(`scrollY === 56`, 4000);
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await sleepMs(100);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 40,
    y: 300,
    deltaX: 0,
    deltaY: 480,
  });
  await waitFor(`scrollY > 300`, 4000).catch(() => {});
  const fastScroll = await evaluate(`scrollY`);
  check(
    "scroll velocity responds to wheel input without a fixed detent speed",
    fastScroll > slowScroll * 4 && fastScroll > 300,
    `${slowScroll}px / ${fastScroll}px`,
  );
  await sleepMs(400);
  check(
    "fast scrolling still settles on a detent",
    await evaluate(`scrollY % 56 === 0`),
  );
  check(
    "screen noise is nonblank",
    await evaluate(
      `document.querySelector('#screen-noise').getContext('2d').getImageData(0,0,1,1).data[3] === 255`,
    ),
  );
  const settingsClickStart = await evaluate(`window.__qa.sfxStarts.length`);
  await click("#system-open");
  await sleepMs(130);
  check(
    "settings grows from its trigger before revealing controls",
    await evaluate(
      `document.querySelector('#system-dialog').getBoundingClientRect().width > 82 && document.querySelector('#system-dialog').getBoundingClientRect().width < 408 && document.querySelector('.system-content').inert && document.querySelector('#system-open').classList.contains('expanded')`,
    ),
  );
  await shot("22-settings-morph");
  await sleepMs(850);
  const settingsSounds = await evaluate(
    `window.__qa.sfxStarts.slice(${settingsClickStart}).map(s=>s.duration)`,
  );
  check(
    "interactive clicks layer event sound over the universal click",
    settingsSounds.some((d) => Math.abs(d - 0.208345) < 0.002) &&
      settingsSounds.some((d) => Math.abs(d - 1 / 6) < 0.002),
  );
  const uiSizes = () =>
    evaluate(
      `Object.fromEntries([...document.querySelectorAll('.nav,.header-tools button,.hero-sub,#explore,.playground-heading,.toy-heading,.transport,#system-dialog,.system-switch-row button')].map((el,i)=>{const r=el.getBoundingClientRect();return [el.id||'element'+i,[r.x,r.y,r.width,r.height]]}))`,
    );
  const chineseSizes = await uiSizes();
  await click('[data-language="en"]');
  const englishSizes = await uiSizes();
  check(
    "language switching preserves control positions and dimensions",
    Object.keys(chineseSizes).every((key) =>
      chineseSizes[key].every(
        (v, i) => Math.abs(v - englishSizes[key][i]) < 0.1,
      ),
    ),
    JSON.stringify({ chineseSizes, englishSizes }),
  );
  check(
    "settings uses a local clear-to-frosted backdrop",
    await evaluate(
      `getComputedStyle(document.querySelector('.system-backdrop')).maskImage.includes('gradient') && getComputedStyle(document.querySelector('.system-backdrop')).backdropFilter.includes('blur')`,
    ),
    await evaluate(
      `JSON.stringify({ mask:getComputedStyle(document.querySelector('.system-backdrop')).maskImage, filter:getComputedStyle(document.querySelector('.system-backdrop')).backdropFilter, reduced:matchMedia('(prefers-reduced-transparency: reduce)').matches, hidden:document.querySelector('.system-backdrop').hidden })`,
    ),
  );
  check(
    "language switching uses ASCII character traversal",
    await evaluate(
      `document.querySelectorAll('.ascii-scramble[data-ascii]').length > 5`,
    ),
  );
  const originalTheme = await evaluate(
    `getComputedStyle(document.querySelector('.playground')).backgroundColor`,
  );
  await click('#system-dialog [data-treatment="mono"]');
  await sleepMs(750);
  check(
    "themes recolor content and banner together",
    await evaluate(
      `getComputedStyle(document.querySelector('.playground')).backgroundColor !== ${JSON.stringify(originalTheme)} && document.querySelector('.hero-art .banner-strata') && getComputedStyle(document.querySelector('.hero-art')).backgroundImage === 'none'`,
    ),
  );
  await click('#system-dialog [data-treatment="duotone"]');
  check(
    "language switch translates titles and controls",
    await evaluate(
      `document.documentElement.lang === 'en' && document.querySelector('#search').placeholder === 'Search compositions…' && !/[\\u4e00-\\u9fff]/.test(document.querySelector('#current-title').textContent)`,
    ),
  );
  await click("#softness");
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Home",
    code: "Home",
    windowsVirtualKeyCode: 36,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Home",
    code: "Home",
    windowsVirtualKeyCode: 36,
  });
  check(
    "screen diffusion can be removed",
    await evaluate(
      `getComputedStyle(document.documentElement).getPropertyValue('--screen-softness').trim() === '0px'`,
    ),
  );
  await shot("09-settings-en");
  await click("#crt-toggle");
  await sleepMs(450);
  check(
    "CRT option applies a real SVG displacement",
    await evaluate(
      `document.documentElement.classList.contains('crt-mode') && getComputedStyle(document.documentElement).filter.includes('crt-lens')`,
    ),
  );
  await shot("23-crt-settings");
  await drag("#softness", 0.1, 0.8);
  check(
    "CRT range dragging follows the visible thumb",
    await evaluate(
      `Math.abs(Number(document.querySelector('#softness').value)-.65) < .06`,
    ),
  );
  await drag("#softness", 0.8, 0);
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);
  // Colored targets independently verify raster placement, then their actual visible pixels are clicked.
  for (const [mx, my] of [
    [24, 24],
    [1416, 24],
    [24, 876],
    [1416, 876],
  ]) {
    await evaluate(
      `(() => { const e=document.createElement('button'); e.id='qa-lens-probe'; e.style.cssText='all:initial;position:fixed;left:${mx - 4}px;top:${my - 4}px;width:8px;height:8px;background:rgb(0,255,0);z-index:999999'; e.onclick=()=>window.__qa.probeHit=true; document.body.append(e); window.__qa.probeHit=false; })()`,
    );
    await sleepMs(80);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    const center = await evaluate(
      `(async () => { const img=new Image();img.src='data:image/png;base64,${data}';await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let x=0,y=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i+1]>220 && d[i]<30 && d[i+2]<30){x+=(i/4)%c.width;y+=Math.floor(i/4/c.width);n++;}}return {x:x/n+.5,y:y/n+.5,n};})()`,
    );
    const expected = lensDisplayPoint(mx, my, 1440, 900);
    check(
      `CRT raster follows the lens map at ${mx},${my}`,
      center.n > 8 &&
        Math.hypot(center.x - expected.x, center.y - expected.y) < 1.8,
      JSON.stringify({ center, expected }),
    );
    if (center.n) {
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", {
          type,
          x: center.x,
          y: center.y,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        });
      check(
        `CRT visible target is clickable at ${mx},${my}`,
        await evaluate(`window.__qa.probeHit`),
      );
    }
    await evaluate(`document.querySelector('#qa-lens-probe').remove()`);
  }
  await drag(".fader-travel", 0.2, 0.8);
  check(
    "CRT mouse dragging keeps the fader under the visible handle",
    await evaluate(
      `Number(document.querySelector('#neuraa-slider').getAttribute('aria-valuenow')) === 80`,
    ),
  );
  const rotateThroughLens = async (touch = false) => {
    const r = await boxOf("#rotary-knob");
    const viewport = await evaluate(
      `({w:document.documentElement.clientWidth,h:innerHeight,y:scrollY,value:Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow'))})`,
    );
    for (let step = 0; step <= 8; step++) {
      const a = (step * Math.PI) / 16;
      const point = lensDisplayPoint(
        r.x + r.w / 2 + 45 * Math.cos(a),
        r.y + r.h / 2 + 45 * Math.sin(a),
        viewport.w,
        viewport.h,
      );
      if (touch)
        await cdp.send("Input.dispatchTouchEvent", {
          type: step ? "touchMove" : "touchStart",
          touchPoints: [point],
        });
      else
        await cdp.send("Input.dispatchMouseEvent", {
          type: step ? "mouseMoved" : "mousePressed",
          ...point,
          button: "left",
          buttons: 1,
          clickCount: 1,
        });
      await sleepMs(25);
    }
    const point = lensDisplayPoint(
      r.x + r.w / 2,
      r.y + r.h / 2 + 45,
      viewport.w,
      viewport.h,
    );
    if (touch)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...point,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    await sleepMs(600);
    const after = await evaluate(
      `({value:Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')),y:scrollY,dragging:document.querySelector('#rotary-knob').classList.contains('dragging'),gestures:window.__qa.gestures.slice(-14)})`,
    );
    return {
      ok:
        after.value === (viewport.value + 90) % 360 &&
        Math.abs(after.y - viewport.y) < 2,
      before: viewport,
      after,
    };
  };
  const crtMouseCrank = await rotateThroughLens();
  check(
    "CRT mouse rotation stays attached to the crank",
    crtMouseCrank.ok,
    JSON.stringify(crtMouseCrank),
  );
  await click("#system-open");
  await sleepMs(900);
  await click("#crt-toggle");
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);
  await click("#system-open");
  await sleepMs(170);
  const growing = await evaluate(
    `document.querySelector('#system-dialog').getBoundingClientRect().width`,
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  const reversing = await evaluate(
    `document.querySelector('#system-dialog').getBoundingClientRect().width`,
  );
  check(
    "settings can reverse into its trigger without restarting geometry",
    Math.abs(growing - reversing) < 24,
  );
  await waitFor(`!document.querySelector('#system-dialog').open`);
  await click("#system-open");
  await sleepMs(900);
  await click("#motion-toggle");
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);
  await click('[data-nav="video"]');
  check(
    "reduced motion switches views immediately",
    await evaluate(
      `document.querySelector('.shell').dataset.view === 'video' && !document.querySelector('.workspace').classList.contains('changing')`,
    ),
  );
  check(
    "motion switch disables continuous motion and scanning",
    await evaluate(`
    getComputedStyle(document.querySelector('#screen-noise')).display === 'none' &&
    getComputedStyle(document.querySelector('.signal-scan')).display === 'none'
  `),
  );
  await shot("10-video-en");
  await click('[data-nav="overview"]');

  await click("#dock-toggle");
  await sleepMs(500);
  check(
    "player collapses into a compact dock with a working play control",
    await evaluate(
      `document.querySelector('.transport').classList.contains('collapsed') && document.querySelector('#dock-toggle').getAttribute('aria-expanded') === 'false' && document.querySelector('.transport').getBoundingClientRect().height === 60 && document.querySelector('#dock-play').getBoundingClientRect().width > 0`,
    ),
  );
  await click("#dock-play");
  await waitFor(`!document.querySelector('#audio').paused`);
  await click("#dock-play");
  await waitFor(`document.querySelector('#audio').paused`);
  await shot("18-collapsed-dock");
  await click("#dock-toggle");
  check(
    "player expands back to its full controls",
    await evaluate(
      `document.querySelector('#dock-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#audio-seek').getBoundingClientRect().width > 0`,
    ),
  );

  console.log("· mobile layout");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleepMs(600);
  check(
    "no horizontal overflow at 390px",
    await evaluate(`document.documentElement.scrollWidth <= 391`),
    `scrollWidth=${await evaluate(`document.documentElement.scrollWidth`)}`,
  );
  await scrollTo("#audio-play");
  await sleepMs(300);
  check(
    "transport controls stay on screen on mobile",
    await evaluate(
      `(() => { const r = document.querySelector('#audio-play').getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })()`,
    ),
  );
  await shot("05-mobile");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await scrollTo(".masthead");
  await sleepMs(300);
  check(
    "English layout fits a 320px screen",
    await evaluate(`document.documentElement.scrollWidth <= 321`),
  );
  check(
    "mobile ruler is visible and has readable tick width",
    await evaluate(
      `(() => { const r = document.querySelector('.scroll-ruler').getBoundingClientRect(); return r.width >= 10 && r.right <= innerWidth && r.top > 0 && r.bottom < innerHeight && getComputedStyle(document.querySelector('.scroll-ruler')).display !== 'none'; })()`,
    ),
  );
  await shot("11-mobile-320-en");
  for (const view of ["audio", "video", "fun"]) {
    await click(`[data-nav="${view}"]`);
    await sleepMs(150);
    check(
      `${view} fits a 320px screen`,
      await evaluate(`document.documentElement.scrollWidth <= 321`),
    );
  }
  await scrollTo("#rotary-knob");
  await shot("15-mobile-rotary");
  const touchKnob = await boxOf("#rotary-knob");
  const tx = touchKnob.x + touchKnob.w / 2,
    ty = touchKnob.y + touchKnob.h / 2;
  const beforeTouch = await evaluate(
    `Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow'))`,
  );
  const scrollBeforeTouch = await evaluate(`scrollY`);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tx + 45, y: ty }],
  });
  for (let i = 1; i <= 8; i++) {
    const a = ((i / 8) * Math.PI) / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: tx + 45 * Math.cos(a), y: ty + 45 * Math.sin(a) }],
    });
    await sleepMs(25);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await sleepMs(100);
  check(
    "touch rotates the dial without scrolling the page",
    await evaluate(`
    Number(document.querySelector('#rotary-knob').getAttribute('aria-valuenow')) === (${beforeTouch}+90)%360 && Math.abs(scrollY-${scrollBeforeTouch}) < 2
  `),
  );
  const mobileFader = await boxOf(".fader-travel");
  const faderScrollY = await evaluate(`scrollY`);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: mobileFader.x + mobileFader.w * 0.1, y: mobileFader.y + 80 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: mobileFader.x + mobileFader.w * 0.9, y: mobileFader.y + 80 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await sleepMs(120);
  check(
    "touch controls the audio fader directly without scrolling",
    await evaluate(
      `Number(document.querySelector('#neuraa-slider').getAttribute('aria-valuenow')) >= 89 && !document.querySelector('.fader-projection') && Math.abs(scrollY-${faderScrollY}) < 2`,
    ),
  );
  await shot("17-fader-mobile");
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await sleepMs(150);
  const rulerBefore = await evaluate(
    `document.querySelector('.scroll-ruler i').style.top`,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 35, y: 440 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 35, y: 440 - i * 27 }],
    });
    await sleepMs(30);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await waitFor(`scrollY > 0 && scrollY % 56 === 0`, 4000).catch(() => {});
  check(
    "mobile swipe retains native movement then snaps to a detent",
    await evaluate(`scrollY > 0 && scrollY % 56 === 0`),
    JSON.stringify(
      await evaluate(`({y:scrollY,events:window.__qa.gestures.slice(-20)})`),
    ),
  );
  check(
    "mobile scroll updates the visible ruler",
    await evaluate(
      `document.querySelector('.scroll-ruler i').style.top !== ${JSON.stringify(rulerBefore)}`,
    ),
  );
  await click("#system-open");
  check(
    "mobile settings fit the screen with all controls reachable",
    await evaluate(
      `(()=>{const d=document.querySelector('#system-dialog').getBoundingClientRect(),c=document.querySelector('.system-content');return d.left>=0 && d.right<=innerWidth && d.top>=0 && d.bottom<=innerHeight && c.scrollWidth<=c.clientWidth;})()`,
    ),
  );
  await click("#crt-toggle");
  await shot("24-mobile-crt-settings");
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);
  const crtTouchCrank = await rotateThroughLens(true);
  check(
    "CRT touch rotation remains aligned without page scrolling",
    crtTouchCrank.ok,
    JSON.stringify(crtTouchCrank),
  );
  const crtFader = await boxOf(".fader-travel");
  const crtViewport = await evaluate(
    `({w:document.documentElement.clientWidth,h:innerHeight,y:scrollY})`,
  );
  for (const [type, fraction] of [
    ["touchStart", 0.2],
    ["touchMove", 0.85],
  ]) {
    const point = lensDisplayPoint(
      crtFader.x + crtFader.w * fraction,
      crtFader.y + crtFader.h / 2,
      crtViewport.w,
      crtViewport.h,
    );
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  check(
    "CRT touch fader follows its visible position",
    await evaluate(
      `Number(document.querySelector('#neuraa-slider').getAttribute('aria-valuenow'))===85 && Math.abs(scrollY-${crtViewport.y})<2`,
    ),
  );
  await click("#system-open");
  await click("#crt-toggle");
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);

  console.log("· reset all preferences on mobile through the CRT lens");
  await click("#system-open");
  await evaluate(`
    localStorage.setItem('qa-unrelated', 'keep');
    document.querySelector('#system-dialog [data-treatment="halftone"]').click();
    document.querySelector('#softness').value = '0';
    document.querySelector('#softness').dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('#volume').value = '.2';
    document.querySelector('#volume').dispatchEvent(new Event('input', {bubbles:true}));
    if(document.querySelector('#system-sfx').getAttribute('aria-checked')==='true') document.querySelector('#system-sfx').click();
    if(document.querySelector('#system-bgm').getAttribute('aria-checked')==='true') document.querySelector('#system-bgm').click();
    document.querySelector('#crt-toggle').click();
  `);
  await click("#settings-reset");
  await sleepMs(700);
  check(
    "reset restores every preference and preserves unrelated storage",
    await evaluate(`
    document.body.dataset.treatment==='duotone' &&
    !document.body.classList.contains('motion-off') &&
    !document.documentElement.classList.contains('crt-mode') &&
    document.documentElement.lang==='zh-CN' &&
    document.querySelector('#softness').value==='0.35' &&
    document.querySelector('#volume').value==='0.65' &&
    document.querySelector('#loop').getAttribute('aria-pressed')==='false' &&
    document.querySelector('.transport').classList.contains('collapsed') &&
    ['#system-sfx','#system-bgm'].every(s=>document.querySelector(s).getAttribute('aria-checked')==='true') &&
    localStorage.getItem('portfolio-theme')===null && localStorage.getItem('portfolio-crt')===null &&
    localStorage.getItem('qa-unrelated')==='keep'
  `),
  );
  await shot("25-mobile-reset");
  await click("#system-close");
  await waitFor(`!document.querySelector('#system-dialog').open`);

  console.log("· direct English entry and OS reduced motion");
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await cdp.send("Page.reload");
  await waitFor(
    `document.querySelector('#enter-en') && !document.querySelector('#enter-en').disabled && document.querySelectorAll('.track').length === 16`,
  );
  await shot("12-mobile-entry");
  await click("#enter-en");
  await waitFor(`document.querySelector('#boot').hidden === true`);
  check(
    "English entry opens the English archive",
    await evaluate(
      `document.documentElement.lang === 'en' && document.querySelector('#current-title').textContent === 'Orchestral Composition'`,
    ),
  );
  await click('[data-nav="fun"]');
  check(
    "OS reduced motion bypasses long transitions",
    await evaluate(
      `document.querySelector('.shell').dataset.view === 'fun' && !document.querySelector('.workspace').inert`,
    ),
  );
  await shot("13-mobile-profile-en");

  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await sleepMs(300);

  console.log("· revised palettes, file stack and depth parallax");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await click('[data-nav="overview"]');
  await waitFor(
    `document.querySelector('.shell').dataset.view==='overview' && !document.querySelector('.workspace').inert`,
  );
  for (const [theme, color] of [
    ["duotone", "rgb(36, 61, 80)"],
    ["halftone", "rgb(17, 17, 17)"],
    ["mono", "rgb(51, 51, 51)"],
  ]) {
    await click(`.scene-corner [data-treatment="${theme}"]`);
    await sleepMs(900);
    check(
      `${theme} palette reaches the profile surface`,
      await evaluate(
        `getComputedStyle(document.querySelector('.biography')).backgroundColor===${JSON.stringify(color)}`,
      ),
    );
    await shot(`26-theme-${theme}`);
  }
  await click('.scene-corner [data-treatment="duotone"]');
  const heroBox = await boxOf(".hero");
  const hoverHero = async (fraction) => {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: heroBox.x + heroBox.w * fraction,
      y: heroBox.y + heroBox.h * 0.35,
    });
    await sleepMs(650);
    return evaluate(
      `parseFloat(getComputedStyle(document.querySelector('.strata-front')).translate)`,
    );
  };
  const parallaxLeft = await hoverHero(0.15);
  const parallaxRight = await hoverHero(0.85);
  check(
    "banner foreground has a clear pointer depth shift",
    Math.abs(parallaxRight - parallaxLeft) > 60,
    `${parallaxLeft} / ${parallaxRight}`,
  );
  await evaluate("scrollTo(0,180)");
  await sleepMs(700);
  check(
    "banner depth responds to scrolling",
    await evaluate(
      `Number(document.querySelector('.hero').style.getPropertyValue('--parallax-scroll'))>10`,
    ),
  );
  await shot("27-profile-parallax");
  await click('[data-nav="audio"]');
  await waitFor(
    `document.querySelector('.shell').dataset.view==='audio' && !document.querySelector('.workspace').inert`,
  );
  check(
    "removed sidebar slogan leaves no content block",
    await evaluate(`!document.querySelector('.catalog-bottom')`),
  );
  const fileBox = await boxOf('[data-category="cinematic"]');
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: fileBox.x + fileBox.w * 0.5,
    y: fileBox.y + fileBox.h * 0.4,
  });
  await sleepMs(650);
  check(
    "file tabs overlap and lift forward with no clipped edge marker",
    await evaluate(`
    (()=>{const b=document.querySelector('[data-category="cinematic"]'),p=b.previousElementSibling,s=getComputedStyle(b);
    return s.zIndex==='3' && new DOMMatrix(s.transform).m41>=7.9 && b.getBoundingClientRect().top<p.getBoundingClientRect().bottom && getComputedStyle(b,'::after').display==='none' && b.offsetHeight===43;})()
  `),
  );
  await shot("28-audio-file-stack");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleepMs(700);
  check(
    "mobile file stack stays compact without page overflow",
    await evaluate(
      `document.documentElement.scrollWidth===320 && document.querySelector('.filter').offsetHeight===32`,
    ),
  );
  await shot("29-mobile-file-stack");

  check(
    "no uncaught page errors",
    errors.length === 0,
    errors.slice(0, 3).join(" | "),
  );
  check(
    "no failed network requests",
    badResponses.length === 0,
    badResponses.slice(0, 3).join(" | "),
  );

  cleanup();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length) {
    console.log("failures:");
    for (const failure of failed)
      console.log(
        ` - ${failure.name}${failure.detail ? ` (${failure.detail})` : ""}`,
      );
    process.exitCode = 1;
  }
}

const qaHook = `
(() => {
  const stats = window.__qa = { sfxStarts: [], sources: [], stretchPeak: 0, errors: [], gestures: [] };
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(text,...args) { if(this.canvas.id==='rotary-particles' && stats.emojis) stats.emojis.push(text); return fillText.call(this,text,...args); };
  for (const name of ['pointerdown','pointerup','pointercancel','wheel','scroll']) {
    document.addEventListener(name,event=>{stats.gestures.push([name, Math.round(performance.now()),event.target.id||event.target.tagName,scrollY]);if(stats.gestures.length>100)stats.gestures.shift();},true);
  }
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    if (this instanceof AudioBufferSourceNode && destination.parameters?.has('pitch')) {
      this.__processor = destination;
      destination.addEventListener('metrics', event => { stats.stretchPeak = Math.max(stats.stretchPeak, event.detail.outputPeak); });
    }
    return connect.call(this, destination, ...args);
  };
  const Context = window.AudioContext || window.webkitAudioContext;
  if (Context) {
    const create = Context.prototype.createBufferSource;
    Context.prototype.createBufferSource = function patched() {
      const source = create.call(this);
      stats.sources.push(source);
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      let record;
      source.start = (...args) => {
        record = { at: performance.now(), duration: source.buffer ? source.buffer.duration : 0, loop: source.loop, offset: args[1] || 0, rate: source.playbackRate.value };
        stats.sfxStarts.push(record);
        return start(...args);
      };
      source.stop = (...args) => {
        if (record) { record.stoppedAt = performance.now(); record.stopDelay = args[0] - this.currentTime; }
        return stop(...args);
      };
      source.addEventListener('ended', () => { if (record) record.endedAt = performance.now(); });
      return source;
    };
  }
  window.addEventListener('error', event => stats.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', event => stats.errors.push(String(event.reason)));
})();
`;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "ignore" });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

async function waitForHttp(url, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleepMs(250);
  }
  throw new Error(`server did not start at ${url}`);
}

async function waitForTarget(port, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleepMs(250);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

const SHOTS = process.env.QA_SHOTS !== "0";
main().catch((error) => {
  cleanup();
  console.error(`QA crashed: ${error.message}`);
  process.exitCode = 1;
});
