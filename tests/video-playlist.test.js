import test from "node:test";
import assert from "node:assert/strict";
import { initVideoPlaylist } from "../src/video-playlist.js";

function fixture(t) {
  class Node {
    constructor() {
      this.attributes = {};
      this.dataset = {};
      this.listeners = {};
      this.children = [];
      this.classList = { remove: (...names) => (this.removedClasses = names) };
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
  }
  const selectors = Object.fromEntries(
    [
      "#video-playlist",
      ".video-caption h3",
      ".video-badge",
      "#video-duration",
      "#video-time",
      "#video-seek",
      "#video-stage",
      ".board-counts > span:nth-child(2) b",
    ].map((selector) => [selector, new Node()]),
  );
  const listeners = {};
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: (selector) => selectors[selector],
    createElement: () => new Node(),
    addEventListener: (type, listener) => (listeners[type] = listener),
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  const videos = [
    {
      id: "showreel",
      title: "原视频",
      src: "media/showreel.mp4",
      poster: "art/video-poster.jpg",
      duration: 81.94,
      width: 1920,
      height: 1080,
    },
    {
      id: "cyberpunk",
      title: "Cyberpunk / 音效设计",
      src: "media/cyberpunk.mp4",
      poster: "art/cyberpunk-poster.jpg",
      duration: 20.927,
      width: 1920,
      height: 1080,
    },
    {
      id: "arcane",
      title: "Arcane / 音效设计",
      src: "media/arcane.mp4",
      poster: "art/arcane-poster.jpg",
      duration: 45.61,
      width: 1920,
      height: 1080,
    },
  ];
  const video = new Node();
  const plays = [];
  const toggles = [];
  const pending = [];
  const engine = {
    media: { video },
    play: (kind, source, commit) => {
      plays.push({ kind, source });
      pending.push(() => {
        video.src = source;
        commit();
      });
      return Promise.resolve();
    },
    toggle: (kind) => toggles.push(kind),
  };
  initVideoPlaylist({
    videos,
    engine,
    asset: (path) => `/portfolio/${path}`,
    translate: (zh) => zh,
  });
  return { videos, video, selectors, plays, toggles, pending, listeners };
}

test("Arcane is selected without autoplay regardless of manifest order", (t) => {
  const { video, selectors, plays } = fixture(t);
  assert.equal(video.src, "/portfolio/media/arcane.mp4");
  assert.equal(video.poster, "/portfolio/art/arcane-poster.jpg");
  assert.equal(selectors[".video-caption h3"].textContent, "Arcane / 音效设计");
  assert.equal(selectors["#video-duration"].textContent, "00:45");
  assert.equal(selectors["#video-playlist"].children.length, 3);
  assert.deepEqual(
    selectors["#video-playlist"].children.map(
      (button) => button.attributes["aria-pressed"],
    ),
    ["false", "false", "true"],
  );
  assert.equal(
    selectors[".board-counts > span:nth-child(2) b"].textContent,
    "03",
  );
  assert.equal(plays.length, 0);
});

test("video metadata changes only when the playback engine accepts a selection", async (t) => {
  const { video, selectors, plays, toggles, pending } = fixture(t);
  const buttons = selectors["#video-playlist"].children;
  await buttons[1].listeners.click();
  assert.deepEqual(plays, [
    { kind: "video", source: "/portfolio/media/cyberpunk.mp4" },
  ]);
  assert.equal(selectors[".video-caption h3"].textContent, "Arcane / 音效设计");
  pending.shift()();
  assert.equal(video.poster, "/portfolio/art/cyberpunk-poster.jpg");
  assert.equal(video.attributes["aria-label"], "Cyberpunk / 音效设计");
  assert.equal(selectors["#video-seek"].value, 0);
  assert.equal(selectors["#video-time"].textContent, "00:00");
  assert.equal(selectors["#video-duration"].textContent, "00:20");
  assert.deepEqual(
    buttons.map((button) => button.attributes["aria-pressed"]),
    ["false", "true", "false"],
  );
  await buttons[1].listeners.click();
  assert.deepEqual(toggles, ["video"]);
  await buttons[0].listeners.click();
  pending.shift()();
  assert.equal(video.src, "/portfolio/media/showreel.mp4");
});
