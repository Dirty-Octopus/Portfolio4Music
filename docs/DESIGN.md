# Art direction

Reference: https://v3.2advanced.com/v3expansionsreboot/

Use V3's blue-gray flats, compact technical typography, and staged interface assembly with millennium forum density. A centered 1180 px layout contains board notices, topic rows, narrow status bands, and a persistent player. Actual architectural artwork fills the hero beneath the brand. All identity art is the supplied Dirty Octopus image, displayed non-destructively through SVG/CSS luminance masks. No generated replacement logo.

Modes: overview, audio archive, visual theater, about; persistent transport. Visual rendering modes (duotone, monochrome, halftone) affect decorative artwork only. Actual playing video retains original colors. Full-screen diffusion softens edges by 0.35 px, adjustable from 0 to 0.8 px. The system drawer exposes SFX, BGM, animation, display treatment, diffusion, language, and current transport status.

Motion is state-driven: 3.2-second initialization followed by overlapping 1.6–3-second panel assembly; 1.9-second view shutters with continuous polygon morphs; 1.25-second staggered panel unfolding; 0.8-second topic reveals; 1.1-second cartridge changes; 0.9-second drawer unfolding. Rapid navigation replaces pending transitions. OS reduced-motion and the in-app motion switch remove both CSS and Web Animations API motion and settle the destination immediately.

The V3 chassis adds cut-corner navigation, notched fascia, side rails, staggered docking, and eight-point panel unfolds. Artwork carries asynchronous 9–21-second contour traces, moving brackets, morphing fins, scanning light, and brief displaced image slices. Flicker is localized to narrow accents and short interaction events. CRT ignition opens from a horizontal beam. The boot sound plays once at power-on; the bright flicker sounds once at the main reveal, on a separate audio lane that preserves its tail through UI interaction. Decorative CSS motion pauses in hidden tabs.

Entry offers Chinese and English; all content titles, categories, status messages, and controls follow the selected language. Original filenames remain intact in the inspector. Independent BGM loops the pad, ducks during content playback, and recovers afterward. Preselection responds to mouse hover and keyboard focus, throttled to prevent sound stacking.

Palette: charcoal #20262a, steel #2d3a43, muted silver #a9bac5, small oxide-red accents #ad625a. Barlow Condensed for display and IBM Plex Mono for machine text, bundled locally. Forum layout lives in `src/forum.css`, CRT/chassis motion in `src/choreography.css`, and translations in `src/i18n.js`.
