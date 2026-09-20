import { clamp } from "./player.js";

const ease = (t) => t * t * (3 - 2 * t);
const detent = 15;
const wrap = (degrees) => ((degrees % 360) + 360) % 360;

export function initTactileExperience({ engine, motionAllowed }) {
  initScroll(engine, motionAllowed);
  initRotary(engine, motionAllowed);
  initNoise(motionAllowed);
}

function initScroll(engine, motionAllowed) {
  const root = document.scrollingElement;
  const ruler = document.querySelector(".scroll-ruler i");
  const step = 56;
  let active = null,
    frame = 0,
    lastWheel = 0,
    remainder = 0;
  let nativeTarget = null,
    nativeTimer = 0,
    touching = false,
    nativeMoved = false;
  const maxScroll = (el) => Math.max(0, el.scrollHeight - el.clientHeight);
  const scroll = (el, y) => el.scrollTo({ top: y, behavior: "instant" });
  const enabled = () =>
    !document.body.classList.contains("boot-visible") &&
    !document.querySelector("#system-dialog").open;
  function rulerPosition() {
    ruler.style.top = `${(root.scrollTop / (maxScroll(root) || 1)) * 100}%`;
  }
  function finishTick(el, from, to) {
    scroll(el, to);
    if (Math.abs(to - from) > 1) engine.sfx("clack");
    rulerPosition();
  }
  function animate(now) {
    frame = 0;
    if (!active) return;
    const a = active;
    a.destination = clamp(a.destination, 0, maxScroll(a.el));
    if (!a.segment) {
      const from = a.el.scrollTop;
      if (Math.abs(from - a.destination) < 1) {
        active = null;
        return;
      }
      const direction = Math.sign(a.destination - from);
      const nextGrid =
        direction > 0
          ? (Math.floor(from / step) + 1) * step
          : (Math.ceil(from / step) - 1) * step;
      const to =
        direction > 0
          ? Math.min(nextGrid, a.destination)
          : Math.max(nextGrid, a.destination);
      a.segment = { from, to, start: now };
    }
    const { from, to, start } = a.segment;
    const progress = motionAllowed()
      ? Math.min(1, (now - start) / (a.native ? 160 : 110))
      : 1;
    scroll(a.el, from + (to - from) * ease(progress));
    rulerPosition();
    if (progress === 1) {
      finishTick(a.el, from, to);
      a.segment = null;
      if (Math.abs(a.el.scrollTop - a.destination) < 1) {
        active = null;
        return;
      }
    }
    frame = requestAnimationFrame(animate);
  }
  function move(el, destination, native = false) {
    if (active?.el !== el) active = { el, destination, segment: null, native };
    else {
      const direction = Math.sign(destination - el.scrollTop);
      if (
        active.segment &&
        Math.sign(active.segment.to - el.scrollTop) !== direction
      )
        active.segment = null;
      active.destination = destination;
    }
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function stop() {
    active = null;
    remainder = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(nativeTimer);
    nativeTarget = null;
    nativeMoved = false;
  }
  function scrollable(target, direction) {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      if (el === root) break;
      if (
        !/(auto|scroll)/.test(getComputedStyle(el).overflowY) ||
        maxScroll(el) <= 1
      )
        continue;
      if (
        (direction > 0 && el.scrollTop < maxScroll(el) - 1) ||
        (direction < 0 && el.scrollTop > 0)
      )
        return el;
    }
    return root;
  }
  document.addEventListener(
    "wheel",
    (event) => {
      if (
        !enabled() ||
        event.ctrlKey ||
        event.metaKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        event.target.closest("input,textarea,select,#rotary-knob,.transport")
      )
        return;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      if (!delta) return;
      const el = scrollable(event.target, Math.sign(delta));
      if (maxScroll(el) <= 0) return;
      event.preventDefault();
      clearTimeout(nativeTimer);
      const now = performance.now();
      if (now - lastWheel > 180 || Math.sign(remainder) !== Math.sign(delta))
        remainder = 0;
      lastWheel = now;
      remainder += delta;
      const ticks = Math.trunc(remainder / 36);
      if (!ticks) return;
      remainder -= ticks * 36;
      const origin = active?.el === el ? active.destination : el.scrollTop;
      const destination = clamp(
        Math.round(origin / step) * step + clamp(ticks, -5, 5) * step,
        0,
        maxScroll(el),
      );
      if (Math.abs(destination - el.scrollTop) > 1) move(el, destination);
    },
    { passive: false },
  );
  function settleNative() {
    clearTimeout(nativeTimer);
    nativeTimer = setTimeout(() => {
      if (touching || !nativeTarget || !nativeMoved || !enabled()) return;
      const current = nativeTarget;
      nativeTarget = null;
      nativeMoved = false;
      const to = clamp(
        Math.round(current.scrollTop / step) * step,
        0,
        maxScroll(current),
      );
      if (Math.abs(to - current.scrollTop) > 1) move(current, to, true);
      else engine.sfx("clack");
    }, 140);
  }
  document.addEventListener(
    "scroll",
    (event) => {
      rulerPosition();
      if (!nativeTarget || active || !enabled()) return;
      const el = event.target === document ? root : event.target;
      if (el !== nativeTarget && nativeTarget !== root) return;
      nativeTarget = el;
      nativeMoved = true;
      settleNative();
    },
    true,
  );
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#rotary-knob,input,button,a,dialog")) return;
    stop();
    touching = true;
    nativeTarget = scrollable(event.target, 1);
  });
  document.addEventListener("pointerup", () => {
    touching = false;
    settleNative();
  });
  document.addEventListener("pointercancel", () => {
    touching = false;
    settleNative();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,textarea,select,button,[role=slider]"))
      return;
    if (
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(
        event.key,
      )
    ) {
      stop();
      nativeTarget = root;
    }
  });
  document.addEventListener("modulechange", stop);
  window.addEventListener("resize", rulerPosition);
  rulerPosition();
}

function initRotary(engine, motionAllowed) {
  const knob = document.querySelector("#rotary-knob");
  const stage = document.querySelector(".rotary-stage");
  const canvas = document.querySelector("#rotary-particles");
  const ctx = canvas.getContext("2d");
  const ticks = document.querySelector(".rotary-ticks");
  for (let i = 0; i < 24; i++) {
    const tick = document.createElement("i");
    tick.style.transform = `rotate(${i * detent}deg)`;
    ticks.append(tick);
  }
  let width = 0,
    height = 0,
    particles = [],
    frame = 0,
    previousTime = 0;
  let inputAngle = 0,
    angle = 0,
    velocity = 0,
    target = 0,
    sounded = 0,
    revolution = 0;
  let pointer = null,
    lastPointerAngle = 0,
    shake = null;
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(resize).observe(stage);
  function burst(gold = false) {
    if (!motionAllowed()) return;
    const count = gold ? 100 : 14;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (gold ? 150 : 80) + Math.random() * (gold ? 190 : 125);
      particles.push({
        x: width / 2 + Math.cos(a) * 65,
        y: height / 2 + Math.sin(a) * 65,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        age: 0,
        life: 0.55 + Math.random() * 0.8,
        color: gold
          ? ["#ffe3a1", "#efbf59", "#eac67b"][i % 3]
          : ["#b5e1d5", "#d79189", "#91bed5"][i % 3],
        size: gold ? 2 : 1.3,
      });
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }
  function feedback(step) {
    const direction = Math.sign(step - sounded);
    for (let cursor = sounded; cursor !== step; cursor += direction) {
      engine.sfx("clack");
      burst();
      revolution += direction;
      if (Math.abs(revolution) >= 24) {
        revolution = 0;
        engine.sfx("round");
        burst(true);
        if (motionAllowed()) {
          shake?.cancel();
          shake = document
            .querySelector(".shell")
            .animate(
              [
                { transform: "translate(0,0)" },
                { transform: "translate(-2px,1px)" },
                { transform: "translate(2px,-1px)" },
                { transform: "translate(-1px,0)" },
                { transform: "translate(0,0)" },
              ],
              { duration: 380, easing: "ease-out" },
            );
        }
      }
    }
    sounded = step;
  }
  function render(now) {
    frame = 0;
    if (
      document.hidden ||
      document.querySelector(".shell").dataset.view !== "fun"
    ) {
      particles = [];
      previousTime = 0;
      return;
    }
    const dt = Math.min((now - (previousTime || now - 16)) / 1000, 0.032);
    previousTime = now;
    if (motionAllowed()) {
      velocity += ((target - angle) * 240 - velocity * 28) * dt;
      angle += velocity * dt;
    } else {
      angle = target;
      velocity = 0;
      particles = [];
    }
    if (Math.abs(target - angle) < 0.015 && Math.abs(velocity) < 0.15) {
      angle = target;
      velocity = 0;
    }
    feedback(Math.round(angle / detent));
    knob.style.transform = `rotate(${angle}deg)`;
    const value = Math.round(wrap(angle));
    knob.setAttribute("aria-valuenow", String(value % 360));
    knob.setAttribute("aria-valuetext", `${value % 360}°`);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.6 * dt);
      p.vy = p.vy * Math.exp(-1.6 * dt) + 58 * dt;
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    particles = particles.filter((p) => p.age < p.life);
    if (angle !== target || particles.length)
      frame = requestAnimationFrame(render);
    else previousTime = 0;
  }
  function wake() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  function pointerAngle(event) {
    const rect = knob.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - rect.top - rect.height / 2,
        event.clientX - rect.left - rect.width / 2,
      ) *
        180) /
      Math.PI
    );
  }
  knob.addEventListener("pointerdown", (event) => {
    if (
      pointer !== null ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    pointer = event.pointerId;
    lastPointerAngle = pointerAngle(event);
    inputAngle = target;
    knob.setPointerCapture(pointer);
    knob.focus({ preventScroll: true });
    knob.classList.add("dragging");
  });
  knob.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer) return;
    const next = pointerAngle(event);
    const delta = ((next - lastPointerAngle + 540) % 360) - 180;
    inputAngle += delta;
    lastPointerAngle = next;
    target = Math.round(inputAngle / detent) * detent;
    wake();
  });
  function release() {
    pointer = null;
    knob.classList.remove("dragging");
  }
  knob.addEventListener("lostpointercapture", release);
  knob.addEventListener("pointerup", release);
  knob.addEventListener("pointercancel", release);
  knob.addEventListener("keydown", (event) => {
    const direction = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    target += direction * detent;
    inputAngle = target;
    wake();
  });
  document.addEventListener("modulechange", () => {
    release();
    particles = [];
    ctx.clearRect(0, 0, width, height);
    if (document.querySelector(".shell").dataset.view === "fun") {
      resize();
      wake();
    } else {
      target = Math.round(angle / detent) * detent;
      inputAngle = target;
      velocity = 0;
    }
  });
}

function initNoise(motionAllowed) {
  const canvas = document.querySelector("#screen-noise");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = 240;
  canvas.height = 150;
  const noise = context.createImageData(canvas.width, canvas.height);
  function draw() {
    if (!document.hidden && motionAllowed()) {
      const pixels = noise.data;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = Math.random() * 255;
        pixels[i + 1] = Math.random() * 255;
        pixels[i + 2] = Math.random() * 255;
        pixels[i + 3] = 255;
      }
      context.putImageData(noise, 0, 0);
    }
    setTimeout(draw, 100);
  }
  draw();
}
