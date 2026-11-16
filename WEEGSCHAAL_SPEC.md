# Weegschaal: bouwopdracht voor Claude Code

> Volledige oorspronkelijke specificatie zoals aangeleverd door Seppe. Werk mijlpaal per mijlpaal (zie §9).

## 1. Het spel in één zin

Je ziet een voorwerp of een verzonnen personage op een ouderwetse balans. Je legt gewichten op de andere schaal, drukt op **Weeg!** en ziet hoe ver je ernaast zat. Je speelt 5 rondes, krijgt een eindscore en komt op een ranglijst.

**Doelgevoel:** zo verslavend en deelbaar als Wordle en zo tactiel en "juicy" als dialed.gg. Het spel moet op een gsm perfect voelen.

## 2. Spelmodi

### 2.1 Dagelijks (hoofdmodus)
- Elke dag om 00:00 (Europe/Brussels) krijgen **alle spelers dezelfde 5 voorwerpen**.
- Je kan de dagelijkse modus maar één keer per dag spelen. Daarna zie je je resultaat, de ranglijst van vandaag en een aftelklok tot het volgende spel.
- De selectie is deterministisch: een seed op basis van de datum (`YYYY-MM-DD`) geeft een vaste volgorde uit de pool. Een voorwerp mag niet binnen 60 dagen terugkomen.
- De moeilijkheid loopt op binnen een dag: ronde 1 is herkenbaar en alledaags, ronde 5 is absurd of zwaar.
- Er zit altijd minstens 1 verzonnen personage in de selectie.

### 2.2 Vrij spel (oefenen)
- Je krijgt 5 willekeurige voorwerpen en kan onbeperkt spelen.
- Deze scores komen niet op de dagelijkse ranglijst, wel op een aparte "beste vrij spel"-lijst.

### 2.3 (Later) Thema-dagen
- Bijvoorbeeld "Dierendag", "Belgische dag" (Atomium, frietkot, Manneken Pis) of "Ruimtedag". Dit hoeft nog niet in v1, maar de datastructuur moet het al ondersteunen via tags op voorwerpen.

## 3. Gameplay in detail

### 3.1 Een ronde
1. Het voorwerp verschijnt met een korte animatie op de linkerschaal: het valt erop, de schaal veert mee en er klinkt een "plof". De balans staat **vergrendeld** met een zichtbare pin of slot, zodat je niets kan afleiden.
2. Je ziet de naam, een korte grappige beschrijving en een label **ECHT** of **FICTIEF**.
3. Je legt gewichten op de rechterschaal:
   - **Tikken** op een gewicht legt het erop. **Slepen** naar de schaal kan ook.
   - **Tikken op een gewicht dat al op de schaal ligt** haalt het weer weg.
   - Gewichten stapelen zichtbaar en realistisch, met grotere gewichten onderaan.
   - Het totaal staat groot en duidelijk in beeld en telt vloeiend op.
4. Je drukt op **Weeg!** Het slot klikt open, de balans kantelt met een geloofwaardige veer- of dempingsanimatie en een wijzer slaat uit.
5. Daarna volgt de onthulling: het echte gewicht telt op, je ziet je score (0–100) en een korte reactie ("Op de gram! 🎯", "Je zat 3× te licht").

### 3.2 Gewichtenset
Decadische gewichten zodat alles van een paperclip tot de Eiffeltoren past:
`1 g · 10 g · 100 g · 1 kg · 10 kg · 100 kg · 1 t · 10 t · 100 t · 1000 t`

- Elk gewicht heeft een eigen visueel karakter: kleine messing gewichtjes, gietijzeren blokken, en voor de tonnen een container of een betonblok met haak. Hoe zwaarder, hoe groter en "industriëler".
- Overweeg ook halve stappen (5 g, 50 g, …) als je dat met een UX-test beter vindt. Hou het scherm wel rustig.

### 3.3 Score
- Per ronde: `score = max(0, round(100 × (1 − |log10(gok / echt)| × 1.3)))`
  - Zit je er 1,1× naast, dan heb je ±95 punten. Bij 2× ±61, bij 5× ±9, bij 10× of meer 0.
- Eindscore: de som van 5 rondes, maximaal **500**.
- Kantelhoek van de balans: `clamp(log10(echt / gok) × 16, −22°, 22°)`.
- **Bonus (optioneel, aan/uit te zetten in de config):** +10 punten als je binnen de 3% zit.

### 3.4 Delen
```
⚖️ Weegschaal #42 — 387/500
🟩🟨🟩🟥🟩
🥚 🚲 🐉 🗽 🍺
weegschaal.example.com
```
- `navigator.share` waar het kan, kopiëren naar het klembord als fallback.
- Vierkantjes: 🟩 ≥ 90, 🟨 ≥ 60, 🟧 ≥ 30, 🟥 < 30.
- Optioneel: een gegenereerde deelafbeelding (canvas → PNG).

## 4. Ranglijst en spelers

### 4.1 Tech: Supabase
GitHub Pages voor de frontend, Supabase voor database en logica.

- **Identiteit:** Supabase anonymous sign-in. Naam max. 20 tekens, gefilterd op scheldwoorden en lege namen. Later optioneel upgraden naar e-maillogin.
- **Tabellen (voorstel):**
  - `players (id uuid = auth.uid, name text, created_at)`
  - `daily_results (player_id, day date, total int, rounds jsonb, created_at, PRIMARY KEY(player_id, day))`
  - `practice_best (player_id, best int, games int, updated_at)`
- **Anti-valsspelen:**
  - Echte gewichten van de dagelijkse voorwerpen niet in de frontend-bundle vóór de ronde gespeeld is.
  - Edge Function of Postgres RPC `weigh(day, round, guess_grams)` geeft het echte gewicht en de score terug en slaat de gok server-side op.
  - Eindscore server-side berekend. De client stuurt nooit zelf een score.
  - Eén dagelijkse poging per speler per dag (primary key + RLS).
  - Vrij spel mag client-side blijven.
- **RLS:** iedereen mag ranglijsten lezen. Schrijven alleen via RPC/Edge Function.

### 4.2 Ranglijst-weergaven
Vandaag (top 50 + eigen positie), Deze week (som ma–zo), Aller tijden (gemiddelde, min. 5 dagen), Vrij spel (beste). Eigen rij valt op. (Later) privégroepen met uitnodigingscode.

### 4.3 Persoonlijke statistieken
Gespeelde dagen, gemiddelde, beste score, huidige reeks, langste reeks, verdeling van rondescores als staafgrafiek.

## 5. Inhoud: voorwerpen en personages

### 5.1 Datastructuur
`data/objects.json`; voor dagelijks alleen server-side in Supabase-tabel `objects`.

```json
{
  "id": "baksteen",
  "name": "Baksteen",
  "description": "Een klassieke volle gevelsteen.",
  "grams": 2200,
  "fictional": false,
  "difficulty": 2,
  "tags": ["bouw", "belgie"],
  "image": "objects/baksteen.webp",
  "emoji": "🧱",
  "source": "https://… (verplicht bij echte voorwerpen)",
  "funFact": "Een gemiddelde rijwoning bevat zo'n 25.000 bakstenen."
}
```

### 5.2 Vereisten
- Minstens 120 echte voorwerpen (1 g tot 10.000 t) en minstens 30 verzonnen personages.
- Elk echt gewicht geverifieerd met een bron (`source`). Geen voorwerpen met sterk variërend gewicht.
- Verzonnen personages zijn eigen creaties (Vlaamse knipoog mag).
- Na de onthulling een fun fact.
- Voorzichtige formulering bij schattingen ("± 8 t (schatting)").

### 5.3 Beelden
Renders uit 3ds Max/V-Ray, 1024×1024, transparant. Tot dan emoji als placeholder; `image` optioneel. Render-briefing in `docs/render-guide.md`.

## 6. Visueel en gevoel
- Warme ambachtelijke apothekers-/marktweegschaal (messing, hout, gietijzer), strak en modern. Geen generieke AI-gradients.
- SVG of Canvas 2D; < 300 KB JS gzip zonder beelden.
- Veer-dempersimulatie, gewichten landen met stuiter, wijzer trilt na, kettingen bewegen mee.
- Geluid via Web Audio (klink, klik, kraak/zwiep, jingle bij ≥ 90), te dempen.
- Haptics via `navigator.vibrate`.
- Score telt op, confetti bij 100, schudden bij 0.
- Dark mode volgt systeem. Toetsenbord, `aria-live`, contrast, `prefers-reduced-motion`.

## 7. Schermen
Home, Spel, Onthulling, Einde, Ranglijst, Statistieken en Instellingen. Alle tekst Nederlands (Vlaams), strings in `src/i18n/nl.ts`.

## 8. Tech-stack en repo
Vite + TypeScript (vanilla of Preact), Supabase JS met anon key, PWA, GitHub Actions → Pages, Vitest voor scoreformule, daily seed en gewichtformattering ("1.500 t", "2,2 kg", "8,5 g").

## 9. Mijlpalen
1. **Kernspel lokaal** — balans met physics, gewichtenlade (tikken + slepen), 5 rondes, score, eindscherm, delen, vrij spel met ≥ 40 voorwerpen. Klaar als: 60 fps op gsm, geen console-errors, tests slagen.
2. **Inhoud** — 120+ echte voorwerpen met bronnen, 30+ personages, fun facts, moeilijkheid, render-guide, validatiescript.
3. **Dagelijks + Supabase** — migraties, anonymous auth, `weigh`-functie, server-side seed, één poging per dag, ranglijsten, statistieken.
4. **Afwerking** — geluid, haptics, confetti, dark mode, tutorial, PWA, deelafbeelding, Lighthouse 90+, deploy via Actions.
5. **Later** — privégroepen, thema-dagen, Engels, "Schaduw".

## 10. Werkwijze
Mijlpaal per mijlpaal, commit per logische stap, vraag alleen bij echte keuzes, checklist voor Seppe in `README.md`.
