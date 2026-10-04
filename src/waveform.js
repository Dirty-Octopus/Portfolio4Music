import { clamp, formatTime } from "./player.js";

// Preserve transients when reducing the source envelope to the available pixels.
export function resamplePeaks(peaks, count) {
  const size = Math.max(1, Math.min(peaks.length, Math.floor(count)));
  return Array.from({ length: size }, (_, i) => {
    let peak = 0;
    const end = Math.ceil(((i + 1) * peaks.length) / size);
    for (let j = Math.floor((i * peaks.length) / size); j < end; j++)
      peak = Math.max(peak, peaks[j] || 0);
    return clamp(peak, 0, 1);
  });
}
export function timeTicks(duration, width) {
  if (!(duration > 0)) return [];
  const target = duration / Math.max(2, Math.floor(width / 84));
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const choices =
    target < 10
      ? [1, 2, 2.5, 5, 10].map((n) => n * magnitude)
      : [5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  const spaced = choices.filter(
    (n) => n >= duration / Math.max(2, Math.floor(width / 70)),
  );
  const step = (spaced.length ? spaced : choices.slice(-1)).reduce(
    (best, value) =>
      Math.abs(value - target) < Math.abs(best - target) ? value : best,
  );
  const ticks = [];
  for (let time = 0; time < duration; time += step)
    ticks.push({ time, fraction: time / duration });
  return ticks;
}
export function initWaveform(canvas, getTrack, audio) {
  const context = canvas.getContext("2d");
  let width = 0,
    height = 0,
    cachedTrack,
    lastFraction = -1,
    peaks = [],
    ticks = [],
    colors;
  const theme = () => {
    const style = getComputedStyle(document.body);
    lastFraction = -1;
    colors = {
      ink: style.getPropertyValue("--ink").trim() || "#e6edf0",
      accent: style.getPropertyValue("--accent").trim() || "#c9e4ee",
      dim: style.getPropertyValue("--muted").trim() || "#75868e",
      line: style.getPropertyValue("--edge").trim() || "#42525d",
    };
  };
  function draw(position) {
    const track = getTrack();
    if (!context || !width || !track) return;
    if (cachedTrack !== track) {
      cachedTrack = track;
      lastFraction = -1;
      peaks = resamplePeaks(track.peaks, width / 2);
      ticks = timeTicks(track.duration, width);
    }
    const fraction = clamp(
      position ?? (audio.duration ? audio.currentTime / audio.duration : 0),
      0,
      1,
    );
    if (fraction === lastFraction) return;
    lastFraction = fraction;
    const ruler = height > 50 ? 20 : 12;
    const center = ruler + (height - ruler) / 2;
    const amplitude = (height - ruler - 8) / 2;
    const x = clamp(fraction * width, 0, width - 1);
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.font = `${height > 80 ? 10 : 8}px "IBM Plex Mono",monospace`;
    context.textBaseline = "top";
    ticks.forEach(({ time, fraction: at }) => {
      const tickX = Math.round(at * width) + 0.5;
      context.strokeStyle = colors.line;
      context.globalAlpha = 0.45;
      context.beginPath();
      context.moveTo(tickX, ruler - 3);
      context.lineTo(tickX, height);
      context.stroke();
      context.globalAlpha = 0.8;
      context.fillStyle = colors.dim;
      if (tickX < width - 42)
        context.fillText(
          track.duration < 10
            ? `${time.toFixed(track.duration < 1 ? 2 : 1)}s`
            : formatTime(time),
          tickX + 4,
          0,
        );
    });
    context.globalAlpha = 0.3;
    context.strokeStyle = colors.dim;
    context.beginPath();
    context.moveTo(0, center + 0.5);
    context.lineTo(width, center + 0.5);
    context.stroke();
    const gap = width / peaks.length;
    peaks.forEach((value, i) => {
      context.globalAlpha = i * gap <= x ? 0.95 : 0.48;
      context.fillStyle = i * gap <= x ? colors.accent : colors.dim;
      const h = Math.max(1, value * amplitude);
      context.fillRect(i * gap, center - h, Math.max(1, gap - 0.8), h * 2);
    });
    context.globalAlpha = 0.12;
    context.fillStyle = colors.accent;
    context.fillRect(Math.max(0, x - 5), ruler, 5, height - ruler);
    context.globalAlpha = 1;
    context.fillStyle = colors.ink;
    context.fillRect(x, ruler - 2, 1, height - ruler + 2);
    context.beginPath();
    context.moveTo(x - 3, ruler - 3);
    context.lineTo(x + 4, ruler - 3);
    context.lineTo(x + 0.5, ruler + 1);
    context.fill();
  }
  const observer = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    cachedTrack = null;
    draw();
  });
  observer.observe(canvas);
  new MutationObserver(() => {
    theme();
    draw();
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-treatment"],
  });
  theme();
  return { draw };
}
