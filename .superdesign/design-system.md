# animepoodle
Discovery app for anime, Chinese anime (donghua), manga, manhwa and manhua. Product interface, not a marketing page.
## Direction
Soft neo-brutalism: outlined panels, short offset shadows, pastel sticker colours, buttons that press in on click. Artwork is never dimmed or overlaid; text sits on solid panels beside or below images.
## Tokens
Light: bg #f4f4fb, surface #fff, ink/line #2a2742, text #1f1d33, muted #5d5a75. Dark: bg #1b1a2c, surface #25233b, line #4c4673, shadow #0d0c1a, text #f2f0ff. Accents (both themes, always with dark ink text): pink #ff9ec7, yellow #ffe68f, sky #9ad8ff, mint #95e9c6, violet #c8b8ff. Borders 2px (1.5px on small chips). Shadows 2/3/5px offset, no blur. Radius 20px panels, 12px buttons, pill chips.
Type: Dela Gothic One for display headings, Schibsted Grotesk for everything else. Sentence case, no all-caps labels.
Theme: System / Light / Dark toggle, stored in localStorage `animepoodle-theme`, applied before paint.
## Structure
Each format is its own section (tabs). Recommendations, Surprise me, moods and library are scoped to the active section and never mix formats. Every title opens a shareable page at /story?format=…&anilist=…&mal=… with synopsis, characters, trailer, AniList and MAL reviews, MAL forum threads, music, artwork and Giscus comments. /rules holds site and community rules.
## Copy
Plain, specific, human. Say what a thing does. No buzzwords, no whimsy ("little universe", "rabbit hole", "magic").
