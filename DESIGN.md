# REWIND visual system

Operating interface for a desktop recorder, inspired by the supplied restrained Japanese concept board, with warm neutral surfaces and beige controls. No decorative game art or invented clips.

- Typography: locally bundled Manrope for Cyrillic UI; IBM Plex Mono for durations, measurements and keycaps.
- Dark: background #111111, sidebar #161615, surface #1b1b19, line #30302d, foreground #f1f0eb, secondary #a3a29a, accent #e6d7bd.
- Light: background #f6f4ee, sidebar #eeece6, surface #fffefa, line #d9d5cb, foreground #242420, secondary #65645c, accent #d9c7a7.
- Layout: fixed 210px navigation, flexible recording column and 277px parameter inspector; single column below 680px.
- Radius: 6px controls, 8px navigation, 12px principal media surface, 16px dialogs.
- Icons: Phosphor exclusively. Filled icons indicate selected navigation, active transport.
- Motion: short dialog/notification arrival only; buffer progress reflects actual elapsed capture. Reduced motion respected.
- First viewport: source selection, replay enable and duration, continuous record, visible quality and audio settings. Library starts empty and displays only saved real clips.

Version 0.2 adds a video-first editor: transport below the image, export inspector on the right, a shared trim ruler and actual per-track waveforms below. Beige selects the trim range. Loading uses a small rotating ring with a gentler reduced-motion variant. The native notification is a wide, flat rail and icon strip inspired by the supplied NVIDIA example; theme colors stay within REWIND's palette. Transitions use 200–280ms strong ease-out. Data and transport actions respond immediately.
