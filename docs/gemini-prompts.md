# Gemini-prompts — Weegschaal (richting A + Noodle)

Plak ze één voor één in Gemini (beeldgeneratie). Ze zijn in het Engels omdat beeldmodellen dat het best begrijpen.
Stuur de beste resultaten terug, dan bouw ik ze na in de app (UI in HTML/CSS, balans en Noodle in Three.js).

**Tip:** genereer eerst de balans (prompt 2) en Noodle (prompt 3). Gebruik die beelden daarna als referentie bij prompt 1, zodat het scherm dezelfde balans en hetzelfde wezen toont.

---

## 0. Gedeelde stijl (staat al in elke prompt hieronder)

> Premium, editorial, slightly unhinged. Pure black background (#050507). Accents used sparingly: aqua #7EE8E2, lilac #B79CFF, hot pink #E25CF1, acid lime #D7FF4A for success. Materials: polished chrome, brushed titanium, iridescent anodized metal, smoked glass, soft holographic gradients like Studio Agatho's 3D shapes. Typography: heavy wide grotesk display (like Unbounded), clean geometric sans for UI (like Space Grotesk), tiny monospace labels (like JetBrains Mono). Hairline grid lines, small technical annotations. Not cute, not childish: think luxury tech product meets designer art toy.

---

## 1. UI: gamescherm (mobiel)

```
High-fidelity mobile UI design for a daily guessing game called "Weegschaal" by "doodaloo", iPhone 15 screen, 390x844, single screen, straight-on flat screenshot, no device frame.

Concept: the player sees an object on a balance scale and must guess its weight by placing weights on the other pan, then presses "Weigh it".

Layout from top to bottom:
- Slim top bar: small quit icon, segmented progress bar of 5 thin segments (first one acid lime, second one aqua-to-lilac gradient, rest dark grey), tiny monospace label "ROUND 2/5 · ANIMALS", score pill "94" on the right.
- Object title in a huge heavy wide grotesk typeface, two lines: "African" in white, "elephant" in lilac #B79CFF. Two small pill tags above it in monospace: "REAL" (aqua) and "ANIMAL" (lilac). One line of muted grey description text.
- Large dark stage card with rounded 28px corners, very subtle hairline grid, soft violet radial glow in the center. Inside: a sleek sculptural balance scale (polished chrome and iridescent titanium, smoked glass pans, a glowing neon hairline dial arc above the pivot). On the left glass pan a cut-out photo of an elephant, on the right pan a few sleek dark metal weights with tiny engraved labels "5 t" and "500 kg". Tiny monospace corner annotations: "PAN A · LOCKED" and "PAN B · 2 ITEMS".
- In the bottom-right corner of the stage, small and understated: a cool designer-art-toy creature called Noodle (tall rounded capsule body, matte pearlescent aqua-to-violet, two small dot eyes, no mouth, leaning casually), about 1/8 of the stage height, with a small white speech bubble: "5.5 tonnes? Bold."
- Readout: tiny monospace label "ON THE SCALE", below it a big number "5,500 kg" in heavy wide grotesk with a white-to-lilac gradient; a small lime "+500 kg" floating to the right.
- Weight tray: a grid of 14 dark rounded tiles (7 columns, 2 rows) labelled 1 g, 10 g, 100 g, 1 kg, 5 kg, 10 kg, 50 kg, 100 kg, 500 kg, 1 t, 5 t, 10 t, 100 t, 1000 t; each tile has a tiny realistic metal weight icon; two tiles are active with a lilac outline and a small count badge.
- Bottom row: a small round outline "reset" button and a wide pill button "Weigh it" with an aqua → lilac → pink gradient, black text, and a black circular arrow icon at its right end.

Style: pure black background #050507, premium editorial game UI in the spirit of dialed.gg mixed with Studio Agatho branding: huge confident typography, generous spacing but rich in small details (hairline grids, monospace annotations, subtle glow). Accent colors used sparingly: aqua #7EE8E2, lilac #B79CFF, hot pink #E25CF1, acid lime #D7FF4A. Crisp, sharp, modern, slightly unhinged, not cute, not childish, no cartoon outlines, no emoji, no clutter.
```

**Variant voor het startscherm:** vervang het lijstje "Layout from top to bottom" door:

```
Home screen layout: small "doodaloo" wordmark with a four-pointed star icon top-left, sound button top-right. One big black rounded card filling most of the screen with a hairline grid: huge lowercase title "weeg" white + "schaal" lilac, tagline "5 things. Guess their weight. Get roasted.", a row of text tabs "mix · real · cartoons · games · animals" (mix active). Centered in the card: the sculptural chrome balance scale as a glowing hero object, Noodle leaning against the plinth, small. Bottom of the card: "Solo or party?" with two white circular icon buttons on the left, and "Daily" with a white circular calendar button wrapped in a slowly rotating aqua-lilac-pink gradient ring on the right. Below the card: three small stat tiles (PLAYED 23, BEST 431 in lime, STREAK 7 in lilac) and a thin monospace ticker line.
```

---

## 2. De balans (hero-render)

```
Product render of a sculptural precision balance scale, a two-pan beam balance reinvented as a luxury design object, centered, 3/4 front view at eye level, on a pure black background (#050507) with a soft violet floor reflection.

Design: a slim monolithic plinth in black brushed titanium with a thin glowing aqua light line around its top edge; a tall slender column in polished chrome; at the top a precision pivot housing with a small iridescent anodized disc (aqua to violet to pink shift); a long thin beam in mirror chrome with tapered ends capped by small iridescent spheres; from each end hang three ultra-thin chrome cables to shallow smoked-glass pans with chrome rims; above the pivot a minimal semicircular dial made of a glowing neon hairline (aqua to lilac to pink gradient) with tiny etched tick marks and a slim hot-pink needle. One pan slightly lower than the other, as if mid-swing.

Lighting: dark studio, large soft key light from top-left, thin rim lights in lilac and aqua tracing the chrome edges, crisp specular highlights, subtle caustics from the glass pans on the floor.

Style: high-end industrial design meets art object, inspired by Studio Agatho's glossy holographic 3D shapes and dialed.gg's black minimal presentation. Photorealistic, octane / V-Ray quality, sharp, premium, cool. Not cute, not cartoonish, no face, no text.
```

**Extra variant:**

```
Same balance scale, exploded technical view: all parts floating slightly apart vertically (plinth, column, pivot, beam, cables, pans, dial), thin white leader lines with tiny monospace labels ("PLINTH · TITANIUM", "BEAM · MIRROR CHROME", "PAN · SMOKED GLASS", "DIAL · NEON"), black background, same lighting.
```

---

## 3. Noodle (mascotte)

```
Character design sheet for "Noodle", a cool minimalist designer art toy mascot for a mobile game. Pure black background (#050507), studio product lighting.

Noodle: a tall smooth capsule-shaped body (like an elongated pill, about 3:1 height to width) with no arms or only two tiny stub hands, made of matte pearlescent vinyl with a subtle iridescent gradient from aqua (#7EE8E2) at the top to deep violet (#8B5CF6) at the bottom, with a thin chrome ring around its middle like a belt. Face: just two small glossy black oval eyes placed high, slightly half-lidded, deadpan and unimpressed. No mouth, no cheeks, no blush. It sometimes wears tiny black rectangular sunglasses.

Attitude: cool, dry, judgmental, effortlessly confident, like a collectible vinyl figure by a high-end art-toy studio. Not cute, not childish, no cartoon outlines.

Show 6 poses in a clean grid, each with a tiny monospace caption:
1. "IDLE": standing straight, eyes half-closed.
2. "LEAN": leaning casually against a thin chrome pole.
3. "SQUASHED": compressed flat by an invisible weight, eyes as two tiny horizontal lines.
4. "STRETCH": stretched very tall and thin, eyes wide.
5. "UNIMPRESSED": sunglasses on, slight tilt.
6. "APPROVED": bouncing slightly off the ground, tiny lime glow under it.

Render: photorealistic 3D toy render, soft key light, lilac and aqua rim lights, soft contact shadows, high detail.
```

---

## Wat ik na jouw beelden doe

- **UI:** de lay-out, typografie, kleuren en details nabouwen in HTML en CSS.
- **Balans:** het ontwerp in Three.js modelleren met dezelfde materialen. Chroom, titanium en rookglas worden PBR-materialen met omgevingsreflecties, de neon-wijzerplaat gaat echt gloeien, en de physics blijft zoals ze nu is.
- **Noodle:** het wezen in 3D bouwen als een kleine, opzettelijk minder aanwezige figuur naast de sokkel. Het reageert op het spel: het wordt platgedrukt bij een zware weging, rekt zich uit bij een hoge score en zet een zonnebril op bij een perfecte gok.
