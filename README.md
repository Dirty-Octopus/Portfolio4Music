# Dirty Octopus / Sonic Explorations

[Open the portfolio](https://dirty-octopus.github.io/Portfolio4Music/)

An interactive music and sound-design portfolio with Chinese and English editions. Inspired by 2Advanced Studios V3 and millennium forums: compact board headers, dense topic rows, angled controls, CRT ignition, layered transitions, and signal traces. Includes the supplied Dirty Octopus identity artwork, three interface themes, four views, a file inspector, and a frosted system control drawer.

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

- 15 music works, with searchable categories and precomputed real waveforms.
- 2 sound-design studies, 4 project sound cues, and 15 site audio assets (ambient music and interface effects), organized across the sound-design and interface-SFX categories.
- 1 independent 1080p H.264/AAC video player with draggable timeline and fullscreen.
- All media and artwork are served locally from `public/`, including the ambient pad, interface and toy sounds, CRT startup, and one-shot flicker.
- Original music, sound-design, and site-effect sources are organized in `audio-sources/music/`, `audio-sources/sound-design/`, and `audio-sources/site-sfx/`. The `audio-sources/` directory is ignored by Git; prepared playback assets are tracked under `public/media/`. `npm run media` regenerates those assets and `src/media.json` from local originals when FFmpeg is available.

## Interaction

Artist profile, audio archive, visual theater, and playground share one continuous layout. Solid-color layers sweep from right to left across the banner and content during navigation, and rapid tab changes resolve to the latest selection. A collapsible bottom transport retains track selection and position. Leaving the theater pauses hidden video. The system drawer controls the Graphite, Oxide, and Phosphor themes, interface motion, SFX, BGM, language, and screen diffusion (0–0.8 px; default 0.35 px). Language can change during playback with ASCII traversal and reserved text space. Artwork and video retain their original colors.

Scrolling retains native speed and momentum, with `lowerclack.wav` feedback and a final detent snap. The playground contains a 12-detent car-window crank above a separate audio scrubber. Crank detents use `clack.wav`; full turns add gold particles and `round.wav`. Emoji fireworks add `suprise.wav` with a 3.5% chance and a guarantee within 50 full turns. The scrubber follows the pointer directly; direction selects its source and position maps to the corresponding audio offset. SoundTouchJS stretches the audio to the drag speed while preserving pitch, with 0.5-second attack/release and short crossfades on seeks or reversals.

`Space`: play/pause when not editing another control. `/`: open the audio archive and focus search. Arrow keys: precise seeking when a progress slider is focused. `Esc`: close the system drawer or clear focused search. Every control supports keyboard focus, and reduced-motion preferences are honored.

## Playback

The portal displays a rotating hourglass while the actual audio files, sound effects, fonts, and logo load. At 100%, the hourglass dissolves into ASCII characters that spread into the two language buttons; controls unlock after assembly finishes. `flicker.wav` accompanies the reveal. Browsers require a gesture before first audible playback, so a blocked cue is deferred to the first portal interaction. Choosing a language plays `bootupcrt.wav`, starts the ambient `pad.wav`, and begins a 2.5-second mechanical assembly: the load rail becomes the archive frame, the blue field contracts into a structural rail, and navigation/content lock into place in overlapping stages. A single animation clock controls the entire handoff; the final DOM state is committed before animation effects are released. Resizing during entry settles directly into the finished archive. Reduced motion skips spatial transitions. The portal is outside the CRT/scroll surface so restored scroll cannot expose archive content during loading. BGM has its own switch beside SFX and automatically ducks while a work or video plays, recovering on pause/end. Mouse hover and keyboard focus play `SFX/preselect.wav`; interface clicks use `SFX/clickevent.wav`, with separate feedback for the toys. Music/video playback is serialized and mutually exclusive; a 35 ms Web Audio gain envelope surrounds source switches, pauses, and seeks. UI effects do not stack; crank round and surprise sounds have independent lanes so they can overlap. Switching SFX off silences effects without stopping the ambient loop. All audio passes through the master volume/mute. These envelopes prevent player-induced abrupt discontinuities; they do not repair artifacts already present in source recordings.

`npm run qa` runs browser acceptance checks and saves screenshots to `.qa/`. `QA_URL` can target an existing local server; `QA_PREVIEW=1` checks a production build.

## Design assets

The supplied logo remains in `public/art/dirty-octopus-logo.jpg`. Its white lettering is traced into `src/metal-logo-geometry.json` and extruded with beveled edges in Three.js. One transparent renderer carries the same rotating object from the portal into the header, preserving position and angular momentum through the handoff. A cold-white studio environment produces moving mirror highlights and dark reflection bands without a rectangular background. Click either metallic logo to play `bootupcrt.wav` and add angular momentum that decays back to a slow rotation; this repeatable sound does not consume the separate startup cue. A clean vector fallback remains available without WebGL. `scripts/trace_logo.py` regenerates the outline using Pillow, NumPy, and contourpy. The blue portal slab contains animated topographic contours; clicking within it sends a ripple through the terrain and plays `water.wav`. Water, logo, and startup sounds have independent lanes, with short envelopes when rapid repeated clicks replace the previous voice. Non-Chromium browsers receive a Chrome/Chromium recommendation without blocking entry. The banner uses composed SVG strata with theme colors and slow horizontal motion. Earlier bitmap artwork remains in `public/art/` but is no longer used for the banner.

Fonts are locally bundled Barlow Condensed and IBM Plex Mono. Icons come from Phosphor. SoundTouchJS license and source information is in `public/THIRD_PARTY_NOTICES.txt`. The site is an original portfolio inspired by [2Advanced V3](https://www.webdesignmuseum.org/gallery/2advanced-studios-v3-2001), not an official reproduction or affiliation.
