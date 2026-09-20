# Dirty Octopus / Sonic Explorations

[Open the portfolio](https://dirty-octopus.github.io/Portfolio4Music/)

An interactive music and sound-design portfolio with Chinese and English editions. Inspired by 2Advanced Studios V3 and millennium forums: compact board headers, dense topic rows, interlocking angled controls, CRT ignition, long panel assembly, signal traces, and continuous shape morphs. Includes the supplied Dirty Octopus identity artwork, nondestructive duotone/posterized/halftone treatments, four interface layouts, a file inspector, and a system control drawer.

## Run and deploy

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Pushing to `main` runs `.github/workflows/deploy.yml`: tests, Vite build, GitHub Pages upload and deployment. Relative asset URLs support the repository subpath and other static hosts. No backend, environment secrets, CDN fonts, or runtime API required.

## Content

- 16 musical works, with searchable categories and precomputed real waveforms.
- 2 interface sound effects, also available under the SFX category.
- 1 independent 1080p H.264/AAC video player with draggable timeline and fullscreen.
- All 23 media files and artwork are served locally from `public/`, including the ambient pad, preselection effect, CRT startup, and one-shot flicker.
- Original local recordings remain untouched and ignored at repository root. `npm run media` regenerates portable media and `src/media.json` when originals and FFmpeg are available. This is not needed to build or deploy.

## Interaction

Overview, audio archive, visual theater, and artist profile are independent layouts. A persistent transport retains track selection and position. Opening the audio/profile view pauses hidden video. The system drawer controls artwork processing, interface motion, SFX, BGM, language, and screen diffusion (0–0.8 px; default 0.35 px). Language can change during playback. The original video colors are retained after playback starts.

`Space`: play/pause when not editing another control. `/`: open the audio archive and focus search. Arrow keys: precise seeking when a progress slider is focused. `Esc`: close the system drawer or clear focused search. Every control supports keyboard focus, and reduced-motion preferences are honored.

## Playback

Browsers require a user gesture before audible playback. Choosing Chinese or English starts `SFX/bootupcrt.wav`, staged initialization, and a continuous loop of `SFX/pad.wav`. The bright `SFX/flicker.wav` sounds once at the visual reveal, with its full natural tail; reduced motion skips this visual cue. Both intro cues are isolated from hover/click sounds and cannot retrigger during navigation. BGM has its own switch beside SFX and automatically ducks while a work or video plays, recovering on pause/end. Mouse hover and keyboard focus play `SFX/preselect.wav`; clicks use the supplied click SFX. Music/video playback is serialized and mutually exclusive; a 35 ms Web Audio gain envelope surrounds source switches, pauses, and seeks. UI effects do not stack; switching SFX off silences UI and intro cues without stopping the ambient loop. All audio passes through the master volume/mute. These envelopes prevent player-induced abrupt discontinuities; they do not repair artifacts already present in source recordings.

`npm run qa` runs browser acceptance checks and saves screenshots to `.qa/`. `QA_URL` can target an existing local server; `QA_PREVIEW=1` checks a production build.

## Design assets

The supplied logo is copied to `public/art/dirty-octopus-logo.jpg` and rendered through a luminance filter without redrawing its lettering. Original generated architectural artwork lives in `public/art/expansions.webp`; generation used the built-in image tool. Its prompt requested a panoramic steel-blue, early-2000s industrial CGI landscape with curved structures, mist, and no text. The site applies the selected color treatment at render time.

Fonts are locally bundled Barlow Condensed and IBM Plex Mono. Icons come from Phosphor. The site is an original portfolio inspired by [2Advanced V3](https://www.webdesignmuseum.org/gallery/2advanced-studios-v3-2001), not an official reproduction or affiliation.
