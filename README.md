# ⚖️ Weegschaal

Raad hoe zwaar iets is. Leg gewichten op de balans, druk op **Weeg!** en kijk hoe ver je ernaast zat. 5 rondes, max. 500 punten.
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

## Technische keuzes

- **Vite + vanilla TypeScript.** Geen framework: de hele app is ±24 KB JS gzip (limiet: 300 KB).
- **Balans in Canvas 2D**, met een eigen veer-dempersimulatie op vaste stap (120 Hz):
  - de balk veert naar zijn doelhoek;
  - de schalen hangen als slinger aan de balk en reageren op de versnelling van het ophangpunt;
  - de schaalbodem veert mee bij elke landing;
  - de wijzer heeft een eigen veer en trilt na.

  Gewichten en emoji worden één keer als sprite voorgerenderd en daarna enkel met `drawImage` getekend. De lus stopt zodra alles stilstaat, zodat er geen batterij verloren gaat. In een gesimuleerde Pixel 7 haalt hij een stabiele 60 fps.
- **Geluid** wordt volledig gesynthetiseerd met Web Audio, zonder samples of auteursrechtelijk beschermd materiaal.
- **Structuur:** `src/game` (logica, seed, score), `src/scale` (balans), `src/ui` (schermen), `src/audio`, `src/i18n/nl.ts` (alle teksten).

## ✅ Checklist voor Seppe

**Nu**
- [ ] Speel een paar rondes op je gsm (`npm run dev -- --host`, of via Pages hieronder) en zeg wat er beter moet aan het gevoel.
- [ ] GitHub Pages aanzetten: *Settings → Pages → Source: GitHub Actions*. Bij elke push naar `main` publiceert `.github/workflows/deploy.yml` het spel.
- [ ] Een definitieve spelnaam en een domein kiezen (nu staat er `weegschaal.example.com` in `src/game/config.ts`).
- [ ] De lanceerdatum voor #1 vastleggen (`launchDate` in `src/game/config.ts`).

**Mijlpaal 2**
- [ ] De lijst voorwerpen nalezen: is de toon goed, en zijn de personages grappig genoeg?
- [ ] Renders maken volgens `docs/render-guide.md` (volgt in mijlpaal 2).

**Mijlpaal 3**
- [ ] Een Supabase-project aanmaken (de stap-voor-stap-uitleg volgt in mijlpaal 3).
- [ ] `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` als GitHub-secrets zetten.

## Bekende beperkingen in mijlpaal 1

- Het dagelijkse spel draait nog **lokaal**: de pool zit in de bundle en de poging wordt in `localStorage` bewaard. Vanaf mijlpaal 3 komen het echte gewicht en de score van de server.
- De regel "geen herhaling binnen 60 dagen" vraagt 5 × 60 = **300 voorwerpen**. Met een kleinere pool kiest het algoritme altijd het langst niet gebruikte voorwerp. Met de huidige 63 voorwerpen komt een voorwerp na ongeveer 1 à 2 weken terug.
- De gewichten en bronnen in `data/objects.json` zijn een tijdelijke set. In mijlpaal 2 wordt elke bron gecontroleerd.
