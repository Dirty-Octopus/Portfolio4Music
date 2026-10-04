/** A single continuous height field, rendered as topographic isobands. */
export function initPortalContour({ motionAllowed = () => true, engine } = {}) {
  const boot = document.querySelector("#boot");
  const face = boot?.querySelector(".boot-face");
  if (!face) return null;

  const plane = document.createElement("div");
  plane.className = "portal-field";
  plane.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  plane.append(canvas);
  face.prepend(plane);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { element: plane, destroy: () => plane.remove() };

  let width = 1;
  let height = 1;
  let cols = 1;
  let rows = 1;
  let values = new Float32Array(4);
  let columnRanges = [[0, 1]];
  let frame = 0;
  let previous = 0;
  let terrainTime = 0;
  let active = true;
  let lineColor = "211, 232, 255";
  const ripples = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const canAnimate = () => motionAllowed() && !reduced.matches;

  // Edge interpolation yields connected contours, rather than unrelated orbit lines.
  function drawContour(level, major) {
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    const stride = cols + 1;
    const points = new Float32Array(8);
    ctx.beginPath();
    for (let row = 0; row < rows; row++) {
      const y = row * cellHeight;
      const [from, to] = columnRanges[row];
      for (let col = from; col < to; col++) {
        const x = col * cellWidth;
        const i = row * stride + col;
        const a = values[i];
        const b = values[i + 1];
        const c = values[i + stride + 1];
        const d = values[i + stride];
        let count = 0;
        if (a > level !== b > level) {
          points[count++] = x + ((level - a) / (b - a)) * cellWidth;
          points[count++] = y;
        }
        if (b > level !== c > level) {
          points[count++] = x + cellWidth;
          points[count++] = y + ((level - b) / (c - b)) * cellHeight;
        }
        if (c > level !== d > level) {
          points[count++] = x + (1 - (level - c) / (d - c)) * cellWidth;
          points[count++] = y + cellHeight;
        }
        if (d > level !== a > level) {
          points[count++] = x;
          points[count++] = y + (1 - (level - d) / (a - d)) * cellHeight;
        }
        if (count >= 4) {
          ctx.moveTo(points[0], points[1]);
          ctx.lineTo(points[2], points[3]);
        }
        if (count === 8) {
          ctx.moveTo(points[4], points[5]);
          ctx.lineTo(points[6], points[7]);
        }
      }
    }
    ctx.lineWidth = major ? 1.15 : 0.72;
    ctx.strokeStyle = `rgba(${lineColor},${major ? 0.47 : 0.26})`;
    ctx.stroke();
  }

  function draw(time) {
    const aspect = width / height;
    const drift = time * 0.095;
    const hillX = 0.64 + Math.sin(drift * 0.83) * 0.025;
    const hillY = 0.32 + Math.cos(drift * 0.67) * 0.043;
    const secondX = 0.43 + Math.sin(drift * 0.51 + 2.1) * 0.022;
    const secondY = 0.84 + Math.cos(drift * 0.59 + 1.4) * 0.042;
    let index = 0;
    for (let row = 0; row <= rows; row++) {
      const y = row / rows;
      for (let col = 0; col <= cols; col++) {
        const x = col / cols;
        const dx = (x - hillX) * aspect;
        const dy = y - hillY;
        const ex = (x - secondX) * aspect;
        const ey = y - secondY;
        let value =
          0.92 * Math.exp(-(dx * dx * 5.2 + dy * dy * 5.8)) +
          0.71 * Math.exp(-(ex * ex * 7.4 + ey * ey * 4.8)) +
          0.052 * Math.sin(x * 13.2 + y * 9.3 + drift) +
          0.031 * Math.cos(x * 8.4 - y * 14.7 - drift * 0.6) +
          x * 0.22 -
          y * 0.1;
        for (const ripple of ripples) {
          const age = time - ripple.time;
          const radius = Math.hypot((x - ripple.x) * aspect, y - ripple.y);
          const wave = radius - age * 0.3;
          value +=
            Math.sin(wave * 42) *
            Math.exp(-wave * wave * 58) *
            Math.exp(-age * 1.5) *
            0.14;
        }
        values[index++] = value;
      }
    }
    ctx.clearRect(0, 0, width, height);
    for (let band = 0; band < 24; band++) {
      drawContour(0.045 + band * 0.046, band % 4 === 0);
    }
    // The leading edge gives each click an immediate, legible response.
    for (const ripple of ripples) {
      const age = time - ripple.time;
      ctx.beginPath();
      ctx.arc(
        ripple.x * width,
        ripple.y * height,
        age * height * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `rgba(${lineColor},${Math.max(0, 0.42 * (1 - age / 2.8))})`;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
    while (ripples.length && time - ripples[0].time > 3.2) ripples.shift();
  }

  function tick(now) {
    frame = 0;
    if (!active || document.hidden) return;
    // Slow terrain evolution reads fluidly at 30fps without competing with audio.
    const delta = previous ? now - previous : 34;
    if (delta >= 1000 / 30) {
      terrainTime += Math.min(delta, 80) / 1000;
      previous = now;
      draw(terrainTime);
    }
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }

  function update() {
    active =
      !boot.hidden &&
      boot.getAttribute("aria-hidden") !== "true" &&
      boot.isConnected;
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!active || document.hidden) return;
    draw(terrainTime);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const rect = face.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Eight-pixel cells keep tight hilltops smooth. Only the visible diagonal
    // band is traced, so finer sampling still uses fewer contour cells overall.
    cols = Math.min(220, Math.max(24, Math.ceil(width / 8)));
    rows = Math.min(160, Math.max(24, Math.ceil(height / 8)));
    const mobile = matchMedia("(max-width: 640px)").matches;
    columnRanges = Array.from({ length: rows }, (_, row) => {
      const topLeft = mobile
        ? 0.91 * (1 - row / rows)
        : 0.65 - (0.4 * row) / rows;
      const bottomLeft = mobile
        ? 0.91 * (1 - (row + 1) / rows)
        : 0.65 - (0.4 * (row + 1)) / rows;
      return [
        Math.max(0, Math.floor(bottomLeft * cols) - 1),
        Math.min(
          cols,
          Math.ceil((topLeft + (mobile ? 0.45 : 0.25)) * cols) + 1,
        ),
      ];
    });
    values = new Float32Array((cols + 1) * (rows + 1));
    update();
  }

  function theme() {
    lineColor =
      document.body.dataset.treatment === "halftone"
        ? "216, 231, 255"
        : "225, 241, 250";
    update();
  }

  function ripple(event) {
    if (!active || boot.dataset.phase === "opening" || event.button > 0) return;
    if (event.target.closest("button,a,input,select,textarea,[role=button]"))
      return;
    const rect = face.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const mobile = matchMedia("(max-width: 640px)").matches;
    const left = mobile ? 0.91 * (1 - y) : 0.65 - 0.4 * y;
    const right = left + (mobile ? 0.45 : 0.25);
    if (x < left || x > right || y < 0 || y > 1) return;
    engine
      ?.unlock()
      .then(() => engine.sfx("water"))
      .catch(() => {});
    if (!canAnimate()) return;
    ripples.push({ x, y, time: terrainTime });
    if (ripples.length > 4) ripples.shift();
  }

  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(face);
  const bootObserver = new MutationObserver(update);
  bootObserver.observe(boot, {
    attributes: true,
    attributeFilter: ["hidden", "aria-hidden", "style"],
  });
  const themeObserver = new MutationObserver(theme);
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-treatment"],
  });
  boot.addEventListener("pointerdown", ripple);
  document.addEventListener("visibilitychange", update);
  document.addEventListener("motionchange", update);
  reduced.addEventListener("change", update);
  theme();
  resize();

  return {
    element: plane,
    redraw: update,
    destroy() {
      active = false;
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      bootObserver.disconnect();
      themeObserver.disconnect();
      boot.removeEventListener("pointerdown", ripple);
      document.removeEventListener("visibilitychange", update);
      document.removeEventListener("motionchange", update);
      reduced.removeEventListener("change", update);
      plane.remove();
    },
  };
}
