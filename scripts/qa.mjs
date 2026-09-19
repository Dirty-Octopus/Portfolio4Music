#!/usr/bin/env node
/** Headless acceptance checks for the portfolio: playback, exclusivity, seeking,
 * interface SFX, boot flow, responsive layout. Zero dependencies: drives an
 * installed Chrome over the DevTools protocol.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const QA_DIR = join(ROOT, '.qa');
const PORT = Number(process.env.QA_PORT || 5199);
const DEBUG_PORT = Number(process.env.QA_DEBUG_PORT || 9333);
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find(candidate => existsSync(candidate));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params);
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
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), timeout);
      const handler = params => {
        clearTimeout(timer);
        this.handlers.set(method, (this.handlers.get(method) || []).filter(h => h !== handler));
        resolve(params);
      };
      this.on(method, handler);
    });
  }
  close() { this.ws.close(); }
}

const sleepMs = ms => sleep(ms);
const errors = [];
const badResponses = [];

async function main() {
  if (!CHROME) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  mkdirSync(QA_DIR, { recursive: true });

  const preview = process.env.QA_PREVIEW === '1';
  if (preview) {
    console.log('· building production bundle');
    await run('npx', ['vite', 'build']);
  }
  console.log(preview ? '· starting Vite preview server' : '· starting Vite dev server');
  const viteArgs = ['vite', preview ? 'preview' : 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'];
  const vite = spawn('npx', viteArgs, { cwd: ROOT, stdio: 'ignore' });
  await waitForHttp(BASE, 40000);

  console.log('· starting headless Chrome');
  const profile = join(tmpdir(), `portfolio-qa-${Date.now()}`);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1440,980', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  const target = await waitForTarget(DEBUG_PORT, 20000);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new CDP(ws);
  cdp.on('Runtime.exceptionThrown', params => errors.push(params.exceptionDetails?.text || 'exception'));
  cdp.on('Runtime.consoleAPICalled', params => {
    if (params.type === 'error') errors.push(params.args.map(a => a.value ?? a.description).join(' '));
  });
  cdp.on('Network.responseReceived', params => {
    if (params.response.status >= 400) badResponses.push(`${params.response.status} ${params.response.url}`);
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: qaHook });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression, awaitPromise = true) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const scrollTo = selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
  const boxOf = async selector => {
    await scrollTo(selector);
    await sleepMs(120);
    return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  };
  const click = async selector => {
    const box = await boxOf(selector);
    if (!box) throw new Error(`missing element ${selector}`);
    const x = box.x + box.w / 2, y = box.y + box.h / 2;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  };
  const drag = async (selector, from, to) => {
    const box = await boxOf(selector);
    if (!box) throw new Error(`missing element ${selector}`);
    const y = box.y + box.h / 2;
    const x1 = box.x + box.w * from, x2 = box.x + box.w * to;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y, button: 'left', clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / 6, y, button: 'left', buttons: 1 });
      await sleepMs(16);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y, button: 'left', clickCount: 1, buttons: 0 });
  };
  const shot = async name => {
    if (!SHOTS) return;
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(QA_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const waitFor = async (expression, timeout = 8000, label = expression) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return true;
      await sleepMs(100);
    }
    throw new Error(`timeout waiting for ${label}`);
  };

  console.log('· loading page');
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: BASE });
  await loaded;
  await sleepMs(900);
  await shot('01-boot');

  check('boot overlay is shown first', await evaluate(`getComputedStyle(document.querySelector('#boot')).display !== 'none'`));
  check('site is inert behind the boot overlay', await evaluate(`document.querySelector('#site').inert === true`));
  check('manifest renders 16 audio tracks', await evaluate(`document.querySelectorAll('.track').length`) === 16);
  check('all 6 filters render', await evaluate(`document.querySelectorAll('.filter').length`) === 6);

  console.log('· entering the experience');
  await click('#enter');
  await waitFor(`document.querySelector('#boot').hidden === true`, 8000, 'boot dismissal');
  await sleepMs(900);
  check('site becomes interactive after entering', await evaluate(`document.querySelector('#site').inert === false`));
  const sfxAfterEnter = await evaluate(`window.__qa.sfxStarts`);
  check('notification SFX plays on entry', sfxAfterEnter.length >= 1 && sfxAfterEnter[0].duration > 1, `voices=${sfxAfterEnter.length}`);
  await shot('02-main');

  console.log('· playback checks');
  await click('.track');
  await sleepMs(600);
  check('clicking a track starts audio playback', await evaluate(`!document.querySelector('#audio').paused`));
  check('player shows the selected track', await evaluate(`document.querySelector('#current-title').textContent.length > 0 && document.querySelector('#play-state').textContent.includes('NOW PLAYING')`));
  check('disc animates while playing', await evaluate(`document.querySelector('#disc').classList.contains('spinning')`));
  const seekA = await evaluate(`document.querySelector('#audio').currentTime`);
  await sleepMs(1400);
  const seekB = await evaluate(`document.querySelector('#audio').currentTime`);
  check('audio position advances', seekB > seekA + 0.5, `${seekA.toFixed(2)}s → ${seekB.toFixed(2)}s`);
  const clicks = await evaluate(`window.__qa.sfxStarts.length`);
  check('clicking a control plays the interface SFX', clicks > sfxAfterEnter.length, `voices=${clicks}`);
  const lastSfx = await evaluate(`window.__qa.sfxStarts[window.__qa.sfxStarts.length - 1].duration`);
  check('interface SFX is the short click, not the notification', lastSfx < 1, `${Number(lastSfx).toFixed(2)}s`);

  console.log('· drag the audio progress bar');
  await drag('#audio-seek', 0.15, 0.72);
  await sleepMs(700);
  const audioAfterDrag = await evaluate(`(() => { const a = document.querySelector('#audio'); return { time: a.currentTime, duration: a.duration, paused: a.paused }; })()`);
  check('audio seek follows the drag', Math.abs(audioAfterDrag.time / audioAfterDrag.duration - 0.72) < 0.06, `${(audioAfterDrag.time / audioAfterDrag.duration * 100).toFixed(1)}%`);
  check('audio keeps playing after the drag', audioAfterDrag.paused === false);
  await shot('03-audio-playing');

  console.log('· video playback and exclusivity');
  await click('#video-overlay');
  await sleepMs(900);
  check('video plays from the overlay', await evaluate(`!document.querySelector('#video').paused`));
  check('starting video pauses audio (no overlap)', await evaluate(`document.querySelector('#audio').paused === true`));
  check('video stage switches to playing state', await evaluate(`document.querySelector('#video-stage').classList.contains('is-playing')`));
  const vA = await evaluate(`document.querySelector('#video').currentTime`);
  await sleepMs(1200);
  const vB = await evaluate(`document.querySelector('#video').currentTime`);
  check('video position advances', vB > vA + 0.4, `${vA.toFixed(2)}s → ${vB.toFixed(2)}s`);
  await shot('04-video-playing');

  console.log('· drag the video progress bar');
  await drag('#video-seek', 0.1, 0.55);
  await sleepMs(900);
  const videoAfterDrag = await evaluate(`(() => { const v = document.querySelector('#video'); return { time: v.currentTime, duration: v.duration, paused: v.paused }; })()`);
  check('video seek follows the drag', Math.abs(videoAfterDrag.time / videoAfterDrag.duration - 0.55) < 0.06, `${(videoAfterDrag.time / videoAfterDrag.duration * 100).toFixed(1)}%`);
  check('video keeps playing after the drag', videoAfterDrag.paused === false);

  console.log('· switching back to audio');
  await click('#audio-play');
  await sleepMs(800);
  check('audio resumes and pauses video', await evaluate(`!document.querySelector('#audio').paused && document.querySelector('#video').paused`));

  console.log('· keyboard shortcuts');
  await evaluate(`document.activeElement && document.activeElement.blur()`);
  await sleepMs(200);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleepMs(400);
  check('space bar pauses playback', await evaluate(`document.querySelector('#audio').paused`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
  await sleepMs(300);
  check('slash focuses the search field', await evaluate(`document.activeElement === document.querySelector('#search')`));
  await cdp.send('Input.insertText', { text: '凯尔特' });
  await sleepMs(500);
  check('search narrows the track list', await evaluate(`document.querySelectorAll('.track').length`) === 2);
  await evaluate(`(() => { const input = document.querySelector('#search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); })()`);
  await sleepMs(400);

  console.log('· filters, loop, volume');
  await evaluate(`[...document.querySelectorAll('.filter')].find(b => b.dataset.category === 'game').click()`);
  await sleepMs(400);
  check('category filter narrows the list', await evaluate(`document.querySelectorAll('.track').length`) === 4);
  await evaluate(`[...document.querySelectorAll('.filter')].find(b => b.dataset.category === 'all').click()`);
  await sleepMs(300);
  await click('#loop');
  await sleepMs(300);
  check('loop toggle reports its state', await evaluate(`document.querySelector('#loop').getAttribute('aria-pressed') === 'true' && document.querySelector('#toast').textContent.includes('单曲循环')`));
  await click('#loop');
  await click('#mute');
  await sleepMs(300);
  check('mute updates the master output label', await evaluate(`document.querySelector('#volume-value').textContent === 'MUTE'`));
  await click('#mute');

  console.log('· mobile layout');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleepMs(600);
  check('no horizontal overflow at 390px', await evaluate(`document.documentElement.scrollWidth <= 391`), `scrollWidth=${await evaluate(`document.documentElement.scrollWidth`)}`);
  await scrollTo('#audio-play');
  await sleepMs(300);
  check('transport controls stay on screen on mobile', await evaluate(`(() => { const r = document.querySelector('#audio-play').getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })()`));
  await shot('05-mobile');

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await sleepMs(300);

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no failed network requests', badResponses.length === 0, badResponses.slice(0, 3).join(' | '));

  cdp.close();
  chrome.kill('SIGKILL');
  vite.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('failures:');
    for (const failure of failed) console.log(` - ${failure.name}${failure.detail ? ` (${failure.detail})` : ''}`);
    process.exitCode = 1;
  }
}

const qaHook = `
(() => {
  const stats = window.__qa = { sfxStarts: [], errors: [] };
  const Context = window.AudioContext || window.webkitAudioContext;
  if (Context) {
    const create = Context.prototype.createBufferSource;
    Context.prototype.createBufferSource = function patched() {
      const source = create.call(this);
      const start = source.start.bind(source);
      source.start = (...args) => {
        stats.sfxStarts.push({ at: performance.now(), duration: source.buffer ? source.buffer.duration : 0 });
        return start(...args);
      };
      return source;
    };
  }
  window.addEventListener('error', event => stats.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', event => stats.errors.push(String(event.reason)));
})();
`;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))));
    child.on('error', reject);
  });
}

async function waitForHttp(url, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await sleepMs(250);
  }
  throw new Error(`server did not start at ${url}`);
}

async function waitForTarget(port, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleepMs(250);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

const SHOTS = process.env.QA_SHOTS !== '0';
main().catch(error => {
  console.error(`QA crashed: ${error.message}`);
  process.exitCode = 1;
});
