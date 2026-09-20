import { clamp } from "./player.js";
import { initFader } from "./fader.js";
import { TurnCharge } from "./surprise.js";

const ease = (t) => t * t * (3 - 2 * t);
const detentCount = 12;
const detent = 360 / detentCount;
const detentThreshold = detent * 0.62;
const wrap = (degrees) => ((degrees % 360) + 360) % 360;

export function initTactileExperience({ engine, motionAllowed }) {
  initScroll(engine, motionAllowed);
  initRotary(engine, motionAllowed);
  initFader(engine);
  initNoise(motionAllowed);
}

function initScroll(engine, motionAllowed) {
  const root = document.scrollingElement;
  const ruler = document.querySelector(".scroll-ruler i");
  const step = 56;
  let active = null,
    frame = 0,
    timer = 0,
    touching = false,
    gesture = null;
  const maxScroll = (el) => Math.max(0, el.scrollHeight - el.clientHeight);
  const scroll = (el, y) => el.scrollTo({ top: y, behavior: "instant" });
  const enabled = () =>
    !document.body.classList.contains("boot-visible") &&
    !document.querySelector("#system-dialog").open;
  function rulerPosition() {
    const progress = clamp(root.scrollTop / (maxScroll(root) || 1), 0, 1);
    ruler.style.top = `${progress * (ruler.parentElement.clientHeight - ruler.offsetHeight)}px`;
    ruler.parentElement.style.backgroundPositionY = `${-root.scrollTop / 7}px`;
  }
  function animate(now) {
    frame = 0;
    if (!active) return;
    const { el, from, start } = active;
    const to = clamp(active.to, 0, maxScroll(el));
    const progress = motionAllowed() ? Math.min(1, (now - start) / 140) : 1;
    scroll(el, from + (to - from) * ease(progress));
    rulerPosition();
    if (progress === 1) {
      engine.sfx("lowerclack");
      active = null;
      return;
    }
    frame = requestAnimationFrame(animate);
  }
  function stop() {
    active = null;
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(timer);
    gesture = null;
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
  function begin(el) {
    if (active) stop();
    clearTimeout(timer);
    if (gesture?.el !== el)
      gesture = { el, moved: false, tick: Math.floor(el.scrollTop / step) };
  }
  function settle() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (touching || !gesture?.moved || !enabled()) return;
      const { el } = gesture;
      gesture = null;
      const from = el.scrollTop;
      const to = clamp(Math.round(from / step) * step, 0, maxScroll(el));
      if (Math.abs(to - from) <= 1) {
        scroll(el, to);
        engine.sfx("lowerclack");
        return;
      }
      active = { el, from, to, start: performance.now() };
      frame = requestAnimationFrame(animate);
    }, 160);
  }
  // Keep native wheel velocity and touch inertia; only the resting position snaps.
  document.addEventListener(
    "wheel",
    (event) => {
      if (
        !enabled() ||
        event.ctrlKey ||
        event.metaKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        event.target.closest("input,textarea,select,[role=slider],.transport")
      )
        return;
      if (!event.deltaY) return;
      const el = scrollable(event.target, Math.sign(event.deltaY));
      if (maxScroll(el) <= 0) return;
      begin(el);
      settle();
    },
    // Run before native scrolling so a previous snap cannot overwrite new input.
    { passive: false },
  );
  document.addEventListener(
    "scroll",
    (event) => {
      rulerPosition();
      if (!gesture || active || !enabled()) return;
      const el = event.target === document ? root : event.target;
      if (el !== gesture.el) begin(el);
      gesture.moved = true;
      const tick = Math.floor(el.scrollTop / step);
      if (tick !== gesture.tick) engine.sfx("lowerclack");
      gesture.tick = tick;
      settle();
    },
    true,
  );
  document.addEventListener("pointerdown", (event) => {
    // A new interaction must also cancel a pending snap when it starts on a control.
    stop();
    touching = false;
    if (
      !enabled() ||
      event.target.closest(
        "[role=slider],input,textarea,select,dialog,.transport",
      )
    )
      return;
    touching = true;
    begin(scrollable(event.target, 1));
  });
  function endTouch() {
    touching = false;
    settle();
  }
  document.addEventListener("pointerup", endTouch);
  document.addEventListener("pointercancel", (event) => {
    // Touch scrolling cancels the pointer while the finger is still on screen.
    if (event.pointerType !== "touch") endTouch();
  });
  document.addEventListener(
    "touchend",
    (event) => {
      if (!event.touches.length) endTouch();
    },
    { passive: true },
  );
  document.addEventListener("touchcancel", endTouch, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,textarea,select,button,[role=slider]"))
      return;
    if (
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(
        event.key,
      )
    ) {
      stop();
      begin(scrollable(event.target, event.key.includes("Up") ? -1 : 1));
    }
  });
  document.addEventListener("modulechange", stop);
  window.addEventListener("resize", rulerPosition);
  new ResizeObserver(rulerPosition).observe(document.body);
  rulerPosition();
}

function initRotary(engine, motionAllowed) {
  const charge = new TurnCharge();
  const emojis = Array.from(
    "😀😃😄😁😆😅😂🙂🙃😉😊😍🤩😘😋😛😜🤪😎🥳😏😮😲🥺😵",
  );
  const knob = document.querySelector("#rotary-knob");
  const stage = document.querySelector(".rotary-stage");
  const canvas = document.querySelector("#rotary-particles");
  const ctx = canvas.getContext("2d");
  const ticks = document.querySelector(".rotary-ticks");
  const meter = document.querySelector(".crank-charge");
  const lamps = [...meter.children];
  for (let i = 0; i < detentCount; i++) {
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
  function burst(gold = false, surprise = false) {
    if (!motionAllowed()) return;
    const count = surprise ? 74 : gold ? 100 : 14;
    const hub = knob.querySelector(".crank-hub").getBoundingClientRect();
    const bounds = stage.getBoundingClientRect();
    const origin = {
      x: hub.left + hub.width / 2 - bounds.left,
      y: hub.top + hub.height / 2 - bounds.top,
    };
    const offset = Math.floor(Math.random() * emojis.length);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (gold ? 150 : 80) + Math.random() * (gold ? 190 : 125);
      particles.push({
        x: origin.x + Math.cos(a) * 3,
        y: origin.y + Math.sin(a) * 3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        age: 0,
        life: 0.55 + Math.random() * 0.8,
        color: gold
          ? ["#ffe3a1", "#efbf59", "#eac67b"][i % 3]
          : ["#b5e1d5", "#d79189", "#91bed5"][i % 3],
        size: gold ? 2 : 1.3,
        emoji: surprise ? emojis[(offset + i * 7) % emojis.length] : null,
        rotation: Math.random() * 2 - 1,
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
      if (Math.abs(revolution) >= detentCount) {
        revolution = 0;
        engine.sfx("round");
        const surprise = charge.turn();
        meter.setAttribute("aria-valuenow", String(charge.level));
        lamps.forEach((lamp, index) =>
          lamp.classList.toggle("lit", index < charge.level),
        );
        meter.classList.toggle("charged", surprise);
        if (surprise) engine.sfx("suprise");
        burst(true, surprise);
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
    const dt = Math.min((now - (previousTime || now - 16)) / 1000, 0.1);
    previousTime = now;
    if (motionAllowed()) {
      // Small integration steps keep the same spring response on slower frames.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      for (let i = 0; i < steps; i++) {
        velocity += ((target - angle) * 480 - velocity * 36) * step;
        angle += velocity * step;
      }
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
    knob.style.setProperty("--crank-angle", `${angle}deg`);
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
      if (p.emoji) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * p.age);
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
        continue;
      }
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
    // Hold each notch past the midpoint so small reversals cannot chatter.
    while (inputAngle - target > detentThreshold) target += detent;
    while (inputAngle - target < -detentThreshold) target -= detent;
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
