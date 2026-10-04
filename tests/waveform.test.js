import test from "node:test";
import assert from "node:assert/strict";
import { resamplePeaks, timeTicks } from "../src/waveform.js";

test("waveform resampling preserves narrow transients including the final sample", () => {
  const peaks = [0, 0.8, 0, 0, 0.2, 0, 0, 1];
  assert.deepEqual(resamplePeaks(peaks, 2), [0.8, 1]);
  assert.deepEqual(resamplePeaks(peaks, 100), peaks);
});

test("time ruler uses legible steps for short effects and long works", () => {
  for (const duration of [0.167, 6.3, 83, 1800]) {
    const ticks = timeTicks(duration, 600);
    assert.ok(ticks.length >= 2 && ticks.length <= 8);
    assert.equal(ticks[0].time, 0);
    assert.ok(
      ticks.every(
        (tick) =>
          tick.time < duration && tick.fraction >= 0 && tick.fraction < 1,
      ),
    );
  }
  assert.deepEqual(timeTicks(0, 600), []);
});
