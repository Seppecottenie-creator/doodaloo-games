"""Downloadt gekozen Commons-foto's, knipt de achtergrond weg (rembg) en schrijft credits.

Gebruik: python3 -I scripts/process_images.py <werkmap> <picks.json>
picks.json: {"voorwerp-id": "w3" | "c0", ...}  (w = wcands.json van Wikipedia, c = candidates.json van Commons)
Schrijft public/objects/<id>.webp en vult `image` + `credit` in data/objects.json.
"""
import html, io, json, os, re, sys, time, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'WeegschaalAssetBot/0.1 (educational game asset collection)'

def fetch(url, tries=6):
  for attempt in range(tries):
    try:
      return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()
    except Exception as e:
      print('  retry', e, flush=True)
      time.sleep(5 + attempt * 10)
  raise RuntimeError('download faalt: ' + url)

def clean_artist(raw):
  t = html.unescape(re.sub(r'<[^>]+>', '', raw or '')).strip()
  t = re.sub(r'\s+', ' ', t)
  return (t[:80] + '…') if len(t) > 80 else (t or 'Onbekend')

def main():
  work, picks_path = sys.argv[1], sys.argv[2]
  srcs = {}
  for key, name in (('c', 'candidates.json'), ('w', 'wcands.json')):
    try: srcs[key] = json.load(open(f'{work}/{name}'))
    except FileNotFoundError: srcs[key] = {}
  picks = json.load(open(picks_path))
  from rembg import new_session, remove
  session = new_session('isnet-general-use')
  objs_path = os.path.join(ROOT, 'data', 'objects.json')
  objs = json.load(open(objs_path))
  by_id = {o['id']: o for o in objs}
  out_dir = os.path.join(ROOT, 'public', 'objects')
  os.makedirs(out_dir, exist_ok=True)
  for oid, idx in picks.items():
    c = srcs[idx[0]][oid][int(idx[1:])]
    if os.path.exists(os.path.join(out_dir, f'{oid}.webp')) and by_id[oid].get('credit', {}).get('url') == c['page']:
      continue
    big = re.sub(r'/\d+px-', '/960px-', c['thumb'])
    print(oid, c['title'], flush=True)
    try:
      raw = fetch(big, tries=2)
    except RuntimeError:
      raw = fetch(c['url'])  # origineel (kleiner dan 960 px of geen thumbnail)
    time.sleep(1)
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    cut = remove(im, session=session, post_process_mask=True)
    bbox = cut.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if bbox:
      cut = cut.crop(bbox)
    cut.thumbnail((512, 512), Image.LANCZOS)
    pad = 8
    canvas = Image.new('RGBA', (cut.width + pad * 2, cut.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad))
    canvas.save(os.path.join(out_dir, f'{oid}.webp'), 'WEBP', quality=86, method=6)
    o = by_id[oid]
    o['image'] = f'objects/{oid}.webp'
    o['credit'] = {'author': clean_artist(c.get('artist')), 'license': c.get('license') or '?', 'url': c['page']}
  json.dump(objs, open(objs_path, 'w'), ensure_ascii=False, indent=2)
  print('klaar', len(picks))

main()
