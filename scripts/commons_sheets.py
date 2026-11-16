"""Contactsheets (4 voorwerpen × 6 kandidaten) uit candidates.json. Gebruik: python3 -I scripts/commons_sheets.py <werkmap> <prefix> id..."""
import io, json, sys, time, urllib.request
from PIL import Image, ImageDraw, ImageFont
UA = 'WeegschaalAssetBot/0.1 (educational game asset collection)'
work, prefix, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
allc = json.load(open(f'{work}/' + (__import__('os').environ.get('CANDS') or 'candidates.json')))
ids = [i for i in ids if allc.get(i)]
font = ImageFont.load_default(size=16)
T = 220
for s in range(0, len(ids), 4):
  chunk = ids[s:s + 4]
  sheet = Image.new('RGB', (6 * T, len(chunk) * (T + 26)), 'white')
  dr = ImageDraw.Draw(sheet)
  for r, oid in enumerate(chunk):
    dr.text((4, r * (T + 26) + 3), oid, fill='black', font=font)
    for c, cand in enumerate(allc[oid][:6]):
      raw = None
      for a in range(4):
        try:
          raw = urllib.request.urlopen(urllib.request.Request(cand['thumb'], headers={'User-Agent': UA}), timeout=30).read(); break
        except Exception:
          time.sleep(5 + a * 5)
      time.sleep(0.5)
      if not raw: continue
      im = Image.open(io.BytesIO(raw)).convert('RGB'); im.thumbnail((T - 6, T - 6))
      x, y = c * T, r * (T + 26) + 24
      sheet.paste(im, (x + 3, y + 3))
      dr.rectangle([x, y, x + 24, y + 20], fill='yellow'); dr.text((x + 7, y + 1), str(c), fill='black', font=font)
  sheet.save(f'{work}/{prefix}-{s // 4:02d}.jpg', quality=82)
  print('sheet', s // 4, chunk, flush=True)
