import './style.css';
import manifest from './media.json';
import { PlaybackEngine, formatTime, clamp } from './player.js';
import playIcon from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import pauseIcon from '@phosphor-icons/core/assets/fill/pause-fill.svg?raw';
import prevIcon from '@phosphor-icons/core/assets/fill/skip-back-fill.svg?raw';
import nextIcon from '@phosphor-icons/core/assets/fill/skip-forward-fill.svg?raw';
import volumeIcon from '@phosphor-icons/core/assets/regular/speaker-high.svg?raw';
import muteIcon from '@phosphor-icons/core/assets/regular/speaker-slash.svg?raw';
import searchIcon from '@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw';
import repeatIcon from '@phosphor-icons/core/assets/regular/repeat.svg?raw';
import fullIcon from '@phosphor-icons/core/assets/regular/corners-out.svg?raw';
import arrowIcon from '@phosphor-icons/core/assets/regular/arrow-up-right.svg?raw';
const icons = { play: playIcon, pause: pauseIcon, 'skip-back': prevIcon, 'skip-forward': nextIcon, 'speaker-high': volumeIcon, 'speaker-slash': muteIcon, 'magnifying-glass': searchIcon, repeat: repeatIcon, 'corners-out': fullIcon, 'arrow-up-right': arrowIcon };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const base = import.meta.env.BASE_URL;
const asset = path => `${base}${path}`;
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon] || ''; el.setAttribute('aria-hidden', 'true'); }); }
hydrateIcons();
const audio = $('#audio'), video = $('#video');
const categories = [
  ['all', '全部作品', 'ALL AUDIO'],
  ['cinematic', '影视 / 管弦', 'CINEMATIC'],
  ['game', '游戏 / 交互', 'GAME & INTERACTIVE'],
  ['world', '世界 / 民族', 'WORLD MUSIC'],
  ['contemporary', '流行 / 实验', 'CONTEMPORARY'],
  ['sfx', '界面音效', 'INTERFACE SFX'],
];
let current = manifest.tracks.find(t => t.title === '管弦乐创作') || manifest.tracks[0];
let category = 'all', query = '', filtered = [], entered = false;
let toastTimer, savedVolume = .65;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200); }
const engine = new PlaybackEngine({ audio, video, onChange: updatePlayback, onError: message => { toast(message); $('#system-status').textContent = 'PLAYBACK ERROR / 请重试'; } });
const sfxReady = engine.preloadSfx(Object.fromEntries(Object.entries(manifest.sfx).map(([key, path]) => [key, asset(path)])));
video.src = asset(manifest.videos[0].src);
video.poster = asset(manifest.videos[0].poster);
audio.src = asset(current.src);
$('#video-duration').textContent = formatTime(manifest.videos[0].duration);
$('#year').textContent = new Date().getFullYear();
$('#filters').innerHTML = categories.map(([key, label, en]) => `<button class="filter ${key === category ? 'active' : ''}" data-category="${key}" aria-pressed="${key === category}"><span>${label}<small>${en}</small></span><small>${String(manifest.tracks.filter(t => key === 'all' ? t.category !== 'sfx' : t.category === key).length).padStart(2, '0')}</small></button>`).join('');
function labelFor(key) { return categories.find(c => c[0] === key)?.[2] || key.toUpperCase(); }
function renderTracks() {
  filtered = manifest.tracks.filter(t => (category === 'all' ? t.category !== 'sfx' : t.category === category) && `${t.title} ${t.filename}`.toLowerCase().includes(query));
  const cat = categories.find(c => c[0] === category);
  $('#category-title').innerHTML = `${cat[1]} <span>${cat[2]}</span>`;
  $('#result-count').textContent = `${String(filtered.length).padStart(2, '0')} FILES`;
  $('#library-summary').textContent = `${filtered.length} TRACKS / ${formatTime(filtered.reduce((s, t) => s + t.duration, 0))} TOTAL`;
  $('#track-list').innerHTML = filtered.length ? filtered.map((track, index) => `<button class="track reveal${track.id === current.id ? ' selected' : ''}" style="--i:${Math.min(index, 7)}" data-track="${track.id}" aria-label="播放 ${escapeHTML(track.title)}" aria-pressed="${track.id === current.id}"><span class="track-index">${String(index + 1).padStart(2, '0')}</span><span class="track-text"><span class="track-name">${escapeHTML(track.title)}</span><span class="track-category">${labelFor(track.category)}</span></span><span class="track-format">${track.format}</span><span class="track-length">${formatTime(track.duration)}</span></button>`).join('') : '<p class="empty">没有找到匹配的作品。<br>试试其他关键词。</p>';
  $('#track-list').scrollTop = 0;
  updatePlayback();
}
function setCurrent(track) {
  current = track;
  $('#current-title').textContent = track.title;
  $('#current-title').title = track.filename;
  $('#current-detail').textContent = `${labelFor(track.category)} / ${track.format} / ${(Number(track.sampleRate) / 1000).toFixed(1)} kHz`;
  $('#audio-duration').textContent = formatTime(track.duration);
  $('#audio-seek').value = 0;
  updatePlayback();
  drawWaveform();
}
function playTrack(track) { return engine.play('audio', asset(track.src), () => setCurrent(track)); }
function updatePlayback() {
  const audioPlaying = !audio.paused && !audio.ended;
  const videoPlaying = !video.paused && !video.ended;
  $('#audio-play').innerHTML = `${audioPlaying ? pauseIcon : playIcon}<span>${audioPlaying ? 'PAUSE' : 'PLAY'}</span>`;
  $('#audio-play').setAttribute('aria-label', audioPlaying ? '暂停音乐' : '播放音乐');
  $('#video-play').innerHTML = videoPlaying ? pauseIcon : playIcon;
  $('#video-play').setAttribute('aria-label', videoPlaying ? '暂停视频' : '播放视频');
  $('#video-stage').classList.toggle('is-playing', videoPlaying);
  $('#video-overlay').setAttribute('aria-label', '播放视频');
  $('#video-overlay').setAttribute('aria-hidden', String(videoPlaying));
  $('#video-overlay').tabIndex = videoPlaying ? -1 : 0;
  $('#disc').classList.toggle('spinning', audioPlaying);
  $('#play-state').textContent = audioPlaying ? 'NOW PLAYING / 正在播放' : (audio.currentTime > 0 ? 'PAUSED / 已暂停' : 'READY / 待播放');
  $('#system-status').innerHTML = `${audioPlaying ? 'AUDIO PLAYING' : videoPlaying ? 'VIDEO PLAYING' : 'READY TO EXPLORE'} <i class="online"></i>`;
  $$('.track').forEach((el, index) => {
    const selected = el.dataset.track === current.id;
    el.classList.toggle('selected', selected);
    el.classList.toggle('playing', selected && audioPlaying);
    el.setAttribute('aria-pressed', String(selected));
    el.setAttribute('aria-label', `${selected && audioPlaying ? '暂停' : '播放'} ${manifest.tracks.find(t => t.id === el.dataset.track).title}`);
    el.querySelector('.track-index').innerHTML = selected && audioPlaying ? '<span class="playing-bars" aria-hidden="true"><i></i><i></i><i></i></span>' : selected ? playIcon : String(index + 1).padStart(2, '0');
  });
  $('#volume-value').textContent = engine.muted ? 'MUTE' : `${Math.round(engine.volume * 100)}%`;
  $('#mute').innerHTML = engine.muted || engine.volume === 0 ? muteIcon : volumeIcon;
  $('#mute').setAttribute('aria-pressed', String(engine.muted));
  $('#mute').setAttribute('aria-label', engine.muted ? '取消静音' : '静音');
}

$('#enter').addEventListener('click', async () => {
  if (entered) return;
  entered = true;
  $('#enter').disabled = true;
  try { await engine.unlock(); } catch { toast('声音尚未开启，进入后点击播放即可。'); }
  $('#boot').classList.add('booting');
  $('.boot-progress').hidden = false;
  $('#boot-status').textContent = 'INITIALIZING AUDIO EXPERIENCE…';
  await Promise.race([sfxReady, new Promise(resolve => setTimeout(resolve, 1800))]);
  await engine.sfx('notification');
  setTimeout(() => {
    $('#boot-status').textContent = 'READY. WELCOME TO THE ARCHIVE.';
    $('#site').inert = false;
    $('#site').classList.add('site-enter');
    $('#boot').classList.add('leaving');
    setTimeout(() => { $('#boot').hidden = true; $('#boot').style.display = 'none'; $('#audio-play').focus({ preventScroll: true }); }, reduced.matches ? 0 : 650);
  }, reduced.matches ? 150 : 1600);
});
// Keep the intro focus in its dialog; every primary control also supports keyboard input.
document.addEventListener('keydown', event => {
  if (!entered || !$('#boot').hidden) {
    if (event.key === 'Tab') { event.preventDefault(); $('#enter').focus(); }
    return;
  }
  const input = event.target.closest('input,textarea,button,a,select');
  if (event.key === ' ' && !input) { event.preventDefault(); engine.toggle(engine.active === 'video' ? 'video' : 'audio'); }
  if (event.key === '/' && !input) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Escape' && event.target === $('#search')) { $('#search').value = ''; query = ''; renderTracks(); $('#search').blur(); }
});
document.addEventListener('click', event => {
  if (!entered || !$('#boot').hidden || !event.target.closest('button,a,input[type=range]')) return;
  if (event.target.closest('#sfx-toggle')) return;
  engine.sfx('clickeffect');
}, true);
$('#sfx-toggle').addEventListener('click', () => {
  engine.sfxEnabled = !engine.sfxEnabled;
  if (!engine.sfxEnabled) { engine.sfxSerial = (engine.sfxSerial || 0) + 1; engine.stopSfx(); }
  else engine.sfx('clickeffect');
  $('#sfx-toggle').setAttribute('aria-pressed', String(engine.sfxEnabled));
  $('#sfx-toggle').setAttribute('aria-label', engine.sfxEnabled ? '关闭界面音效' : '开启界面音效');
  $('#sfx-toggle b').textContent = engine.sfxEnabled ? 'ON' : 'OFF';
});
$('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  category = button.dataset.category;
  $$('.filter').forEach(el => { el.classList.toggle('active', el === button); el.setAttribute('aria-pressed', String(el === button)); });
  renderTracks();
});
$('#search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); renderTracks(); });
$('#track-list').addEventListener('click', event => {
  const button = event.target.closest('[data-track]');
  if (!button) return;
  const track = manifest.tracks.find(t => t.id === button.dataset.track);
  if (current.id === track.id) engine.toggle('audio');
  else playTrack(track);
});
$('#audio-play').addEventListener('click', () => engine.toggle('audio'));
$('#video-play').addEventListener('click', () => engine.toggle('video'));
$('#video-overlay').addEventListener('click', () => engine.play('video'));
video.addEventListener('click', () => { if (!video.paused) { engine.sfx('clickeffect'); engine.pause('video'); } });
function adjacent(direction) {
  const list = filtered.length ? filtered : manifest.tracks.filter(t => t.category !== 'sfx');
  const index = list.findIndex(t => t.id === current.id);
  const next = index < 0 ? (direction > 0 ? 0 : list.length - 1) : (index + direction + list.length) % list.length;
  playTrack(list[next]);
}
$('#previous').addEventListener('click', () => adjacent(-1));
$('#next').addEventListener('click', () => adjacent(1));
$('#loop').addEventListener('click', () => { engine.repeat = !engine.repeat; $('#loop').setAttribute('aria-pressed', String(engine.repeat)); toast(engine.repeat ? '已开启单曲循环' : '已关闭单曲循环'); });
$('#volume').addEventListener('input', event => { engine.setMuted(false); engine.setVolume(event.target.value); savedVolume = engine.volume; });
$('#mute').addEventListener('click', () => { engine.setMuted(!engine.muted); if (!engine.muted && !engine.volume) { engine.setVolume(savedVolume || .65); $('#volume').value = engine.volume; } });
const dragging = { audio: false, video: false };
function bindSeek(kind) {
  const element = engine.media[kind], slider = $(`#${kind}-seek`);
  let resume = false, committed = false;
  const preview = () => {
    $(`#${kind}-time`).textContent = formatTime(Number(slider.value) / 100 * (element.duration || 0));
    slider.setAttribute('aria-valuetext', `${$(`#${kind}-time`).textContent} / ${formatTime(element.duration)}`);
    if (kind === 'audio') drawWaveform(Number(slider.value) / 100);
  };
  slider.addEventListener('pointerdown', () => {
    dragging[kind] = true; committed = false; resume = !element.paused;
    engine.pause(kind);
  });
  slider.addEventListener('input', () => { if (!dragging[kind]) resume = !element.paused; dragging[kind] = true; preview(); });
  const commit = () => {
    if (committed || !dragging[kind]) return;
    committed = true;
    const target = Number(slider.value) / 100 * (element.duration || 0);
    engine.seek(kind, target, resume).finally(() => { dragging[kind] = false; committed = false; });
  };
  slider.addEventListener('change', commit);
  slider.addEventListener('pointerup', commit);
  slider.addEventListener('pointercancel', commit);
  slider.addEventListener('blur', commit);
  element.addEventListener('loadedmetadata', () => { $(`#${kind}-duration`).textContent = formatTime(element.duration); });
}
bindSeek('audio'); bindSeek('video');
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('#video-section').requestFullscreen) await $('#video-section').requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else toast('此浏览器不支持视频全屏。');
  } catch { toast('全屏未能开启，请重试。'); }
});
function focusSection(name) {
  const section = $(`#${name}-section`);
  $$('.nav').forEach(el => el.classList.toggle('active', el.dataset.nav === name));
  section.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'center' });
  section.classList.remove('panel-pulse');
  requestAnimationFrame(() => section.classList.add('panel-pulse'));
  setTimeout(() => section.classList.remove('panel-pulse'), 850);
}
$$('[data-nav]').forEach(button => button.addEventListener('click', () => focusSection(button.dataset.nav)));
$('#explore').addEventListener('click', () => { focusSection('audio'); engine.play('audio'); });
$('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' }));
$('.brand').addEventListener('click', event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' }); });
const wave = $('#waveform');
const waveContext = wave.getContext('2d');
let waveWidth = 0, waveHeight = 0;
function sizeWave() {
  const rect = wave.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  waveWidth = rect.width; waveHeight = rect.height;
  wave.width = Math.round(rect.width * dpr); wave.height = Math.round(rect.height * dpr);
  waveContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWaveform();
}
function drawWaveform(position) {
  if (!waveContext || !current || !waveWidth) return;
  const fraction = position ?? (audio.duration ? audio.currentTime / audio.duration : 0);
  waveContext.clearRect(0, 0, waveWidth, waveHeight);
  const count = Math.min(current.peaks.length, Math.floor(waveWidth / 3));
  const gap = waveWidth / count;
  for (let i = 0; i < count; i++) {
    const value = current.peaks[Math.floor(i / count * current.peaks.length)];
    const height = Math.max(2, value * (waveHeight - 5));
    waveContext.fillStyle = i / count <= fraction ? '#b7e4f9' : '#65879e';
    waveContext.fillRect(i * gap, (waveHeight - height) / 2, Math.max(1, gap - 1), height);
  }
  waveContext.fillStyle = '#e5f4fa';
  waveContext.fillRect(clamp(fraction * waveWidth, 0, waveWidth - 1), 0, 1, waveHeight);
}
setCurrent(current); renderTracks();
new ResizeObserver(sizeWave).observe(wave);
const spectrum = $('#spectrum'), spectrumContext = spectrum.getContext('2d');
const bins = new Uint8Array(128);
let lastFrame = 0;
function frame(time) {
  requestAnimationFrame(frame);
  if (document.hidden || time - lastFrame < (reduced.matches ? 160 : 32)) return;
  lastFrame = time;
  for (const kind of ['audio', 'video']) {
    const element = engine.media[kind];
    if (dragging[kind]) continue;
    const percent = element.duration ? element.currentTime / element.duration * 100 : 0;
    $(`#${kind}-seek`).value = percent;
    $(`#${kind}-time`).textContent = formatTime(element.currentTime);
    $(`#${kind}-seek`).setAttribute('aria-valuetext', `${formatTime(element.currentTime)} / ${formatTime(element.duration)}`);
  }
  if (!dragging.audio) drawWaveform();
  if (engine.analyser) engine.analyser.getByteFrequencyData(bins);
  spectrumContext.clearRect(0, 0, spectrum.width, spectrum.height);
  for (let i = 0; i < 28; i++) {
    const value = engine.analyser ? bins[Math.floor(i * 2.8)] / 255 : 0;
    const height = Math.max(2, value * 36);
    spectrumContext.fillStyle = '#7caac2';
    for (let j = 0; j < height; j += 4) spectrumContext.fillRect(i * 6.4, 36 - j, 4, 2);
  }
  // A short tail ramp avoids abrupt ends in sketches that end mid-waveform.
  if (engine.active && engine.context) {
    const element = engine.media[engine.active];
    const remaining = element.duration - element.currentTime;
    if (!element.paused && remaining > 0 && remaining < .055) engine.ramp(engine.active, 0, Math.max(.005, remaining - .003));
  }
}
requestAnimationFrame(frame);
// Audio routing stays centralized for media keys as well as on-screen controls.
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => engine.play(engine.active || 'audio'));
  navigator.mediaSession.setActionHandler('pause', () => engine.pause(engine.active || 'audio'));
  navigator.mediaSession.setActionHandler('previoustrack', () => adjacent(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => adjacent(1));
  navigator.mediaSession.setActionHandler('seekto', event => engine.seek(engine.active || 'audio', event.seekTime));
}
