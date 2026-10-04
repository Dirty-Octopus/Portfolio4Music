// A large file on a slow connection may take longer than thirty seconds.
// Abort stalled transfers, not transfers that are still delivering audio.
export async function fetchCompleteAudio(url, idleMs = 30000) {
  const controller = new AbortController();
  let timer;
  const renew = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  let reader;
  try {
    renew();
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Audio unavailable: ${url}`);
    renew();
    if (!response.body?.getReader) return await response.arrayBuffer();
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      renew();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}

/** Cache complete audio files; only decoded interaction sounds stay in PCM memory. */
export class AudioAssets {
  constructor(engine, resolve) {
    this.engine = engine;
    this.resolve = resolve;
    this.urls = new Map();
    this.completed = new Set();
  }
  url(path) {
    return this.urls.get(path) || this.resolve(path);
  }
  async load(tracks, sounds, progress = () => {}) {
    const entries = new Map(tracks.map((track) => [track.src, []]));
    for (const [name, path] of Object.entries(sounds)) {
      if (!entries.has(path)) entries.set(path, []);
      entries.get(path).push(name);
    }
    const jobs = [...entries].sort((a, b) => b[1].length - a[1].length);
    let done = jobs.filter(([path]) => this.completed.has(path)).length;
    const report = () => progress(done / jobs.length);
    report();
    this.engine.initialize();
    this.engine.rawSfx ??= {};
    let index = 0;
    // Four requests keep the boot responsive on mobile connections.
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, async () => {
        while (index < jobs.length) {
          const [path, names] = jobs[index++];
          if (this.completed.has(path)) continue;
          let data;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              data = await fetchCompleteAudio(this.resolve(path));
              if (!data.byteLength) throw new Error(`Empty audio: ${path}`);
              break;
            } catch (error) {
              if (attempt) throw error;
            }
          }
          for (const name of names) {
            this.engine.rawSfx[name] = data;
            if (!(await this.engine.decodeSfx(name)))
              throw new Error(`Audio decode failed: ${name}`);
          }
          const type = path.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
          this.urls.set(path, URL.createObjectURL(new Blob([data], { type })));
          this.completed.add(path);
          done++;
          report();
        }
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}
