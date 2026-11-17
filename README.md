# ⚖️ Weegschaal

Raad hoe zwaar iets is. Leg gewichten op de balans, druk op **Weigh!** en laat je uitlachen door de balans. 5 rondes, max. 500 punten.
Het spel is in het **Engels** (`src/i18n/en.ts`); de Nederlandse teksten staan nog in `src/i18n/nl.ts` voor een latere taalknop.
De volledige bouwopdracht staat in [`WEEGSCHAAL_SPEC.md`](WEEGSCHAAL_SPEC.md).

## Status

| Mijlpaal | Status |
| --- | --- |
| 1. Kernspel lokaal | ✅ klaar |
| 2. Inhoud (120+ voorwerpen, 30+ personages, bronnen, validatie) | ⏳ |
| 3. Dagelijks + Supabase (anti-valsspelen, ranglijsten) | ⏳ |
| 4. Afwerking (PWA, tutorial, deelafbeelding, Lighthouse) | ⏳ (geluid, haptics, confetti en dark mode zitten er al in) |

## Lokaal draaien

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: score, daily seed, Belgische notatie
npm run build      # productiebuild in dist/
```

## Wat er in het spel zit

- **14 gewichten**: 1 g · 10 g · 100 g · 1 kg · 5 kg · 10 kg · 50 kg · 100 kg · 500 kg · 1 t · 5 t · 10 t · 100 t · 1000 t, elk met een eigen 3D-model (messing, kettlebell, halterschijf, aambeeld, brandkast, containers…). De tabel staat in `src/game/config.ts` (`WEIGHT_SPECS`).
- **Stapels passen altijd**: zwaarste onderaan, desnoods in twee torens, max. 4 zichtbaar per soort met een ×N-label (`src/scale/layout.ts`, getest).
- **De balans heeft een gezicht**: googly eyes die je vinger volgen, wenkbrauwen en mond die reageren, knipperen; X-ogen bij 0 punten.
- **Roasts**: per score een felle (vloekende) reactie in een tekstballon; ook als je het hoofd of het voorwerp aantikt (`src/game/roast.ts`).
- **Interactie**: tikken, slepen, ingedrukt houden om te blijven toevoegen, tik op een gewicht op de schaal om het weg te halen, tik op het hoofd of het voorwerp.
- **UI**: home met een levende balans, ronde-intro, zwevende +/−-meldingen, logaritmische meter bij de onthulling, eindscherm met scorering.

## Technische keuzes

- **Vite + vanilla TypeScript.** De startpagina laadt ±26 KB JS gzip. De 3D-balans (Three.js, ±131 KB gzip) wordt op de achtergrond geladen terwijl je op home staat. Samen blijft dat ruim onder de limiet van 300 KB.
- **3D-balans in Three.js** (`src/scale/ScaleView3D.ts`):
  - messing met echte omgevingsreflecties, een houten sokkel, kettingen uit losse schakels en zachte schaduwen;
  - de lus rendert alleen zolang er iets beweegt;
  - zonder WebGL valt het spel terug op de 2D-balans (`ScaleView.ts`).
- **Physics** (`src/scale/physics.ts`): een veer-dempersimulatie op vaste stap. De balk veert na, de schalen slingeren mee en de wijzer trilt na. Gewichten vallen en stuiteren.
- **Foto's**: vrij gelicentieerde foto's van Wikimedia Commons, met de achtergrond automatisch verwijderd (rembg). De credits staan in `objects.json` (`credit`) en zijn te zien in het spel en op het scherm *Fotocredits*. Voorwerpen zonder foto, zoals de verzonnen personages, verschijnen als goudkleurig beeldje.
- **Geluid**: volledig gesynthetiseerd met Web Audio.

### Foto's toevoegen of vervangen

```bash
pip install "rembg[cpu]" pillow
python3 -I scripts/wiki_candidates.py <werkmap> <id> ...      # kandidaten uit Wikipedia-artikels
CANDS=wcands.json python3 -I scripts/commons_sheets.py <werkmap> blad <id> ...   # contactsheet om te kiezen
echo '{"<id>": "w0"}' > picks.json
python3 -I scripts/process_images.py <werkmap> picks.json    # downloaden, uitknippen, credits invullen
```

Jouw eigen renders zet je als `public/objects/<id>.webp` (of `.png`) en je verwijst ernaar met `image` in `objects.json`. Haal dan ook het `credit`-veld weg. Wil je een set voorwerpen bekijken, open dan het spel met `?test=id1,id2,…` en kies *Vrij spel*.

## ✅ Checklist voor Seppe

**Nu**
- [ ] Speel een paar rondes op je gsm (`npm run dev -- --host`, of via Pages hieronder) en zeg wat er beter moet aan het gevoel.
- [ ] GitHub Pages aanzetten: *Settings → Pages → Source: GitHub Actions*. Bij elke push naar `main` publiceert `.github/workflows/deploy.yml` het spel.
- [ ] Een definitieve spelnaam en een domein kiezen (nu staat er `weegschaal.example.com` in `src/game/config.ts`).
- [ ] De lanceerdatum voor #1 vastleggen (`launchDate` in `src/game/config.ts`).

**Mijlpaal 2**
- [ ] De lijst voorwerpen nalezen: is de toon goed, en zijn de personages grappig genoeg?
- [ ] Renders maken voor de voorwerpen zonder foto en voor de verzonnen personages, volgens `docs/render-guide.md` (volgt in mijlpaal 2).

**Mijlpaal 3**
- [ ] Een Supabase-project aanmaken (de stap-voor-stap-uitleg volgt in mijlpaal 3).
- [ ] `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` als GitHub-secrets zetten.

## Bekende beperkingen in mijlpaal 1

- Het dagelijkse spel draait nog **lokaal**: de pool zit in de bundle en de poging wordt in `localStorage` bewaard. Vanaf mijlpaal 3 komen het echte gewicht en de score van de server.
- De regel "geen herhaling binnen 60 dagen" vraagt 5 × 60 = **300 voorwerpen**. Met een kleinere pool kiest het algoritme altijd het langst niet gebruikte voorwerp. Met de huidige 63 voorwerpen komt een voorwerp na ongeveer 1 à 2 weken terug.
- De gewichten en bronnen in `data/objects.json` zijn een tijdelijke set. In mijlpaal 2 wordt elke bron gecontroleerd.
