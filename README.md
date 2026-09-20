# Dirty Octopus / Sonic Explorations

[Open the portfolio](https://dirty-octopus.github.io/Portfolio4Music/)

An interactive music and sound-design portfolio, drawing on 2Advanced Studios V3's typography, separated panels, restrained blue-gray palette, and staged motion. Includes the supplied Dirty Octopus identity artwork, nondestructive duotone/posterized/halftone treatments, four actual interface layouts, a file inspector, and a system control drawer.

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
- All 19 media files and artwork are committed under `public/`.
- Original local recordings remain untouched and ignored at repository root. `npm run media` regenerates portable media and `src/media.json` when originals and FFmpeg are available. This is not needed to build or deploy.

## Interaction

Overview, audio archive, visual theater, and artist profile are independent layouts. A persistent transport retains track selection and position. Opening the audio/profile view pauses hidden video. The system drawer controls artwork processing, interface motion, and interface sounds. The original video colors are retained after playback starts.

`Space`: play/pause when not editing another control. `/`: open the audio archive and focus search. Arrow keys: precise seeking when a progress slider is focused. `Esc`: close the system drawer or clear focused search. Every control supports keyboard focus, and reduced-motion preferences are honored.

## Playback

Browsers require a user gesture before audible playback. The entry button starts the notification and the short initialization animation. UI clicks use the supplied click SFX. Music/video playback is serialized and mutually exclusive; a 35 ms Web Audio gain envelope surrounds source switches, pauses, and seeks. Interface effects run through a separate low-level bus and do not stack. These envelopes prevent player-induced abrupt discontinuities; they do not repair artifacts already present in source recordings.

## Design assets

The supplied logo is copied to `public/art/dirty-octopus-logo.jpg` and rendered through a luminance filter without redrawing its lettering. Original generated architectural artwork lives in `public/art/expansions.webp`; generation used the built-in image tool. Its prompt requested a panoramic steel-blue, early-2000s industrial CGI landscape with curved structures, mist, and no text. The site applies the selected color treatment at render time.

Fonts are locally bundled Barlow Condensed and IBM Plex Mono. Icons come from Phosphor. The site is an original portfolio inspired by [2Advanced V3](https://www.webdesignmuseum.org/gallery/2advanced-studios-v3-2001), not an official reproduction or affiliation.
