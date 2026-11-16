"""Zoekt per voorwerp foto-kandidaten op Wikimedia Commons en maakt contactsheets om te kiezen.

Gebruik: python3 -I scripts/commons_candidates.py <werkmap> [id ...]
Schrijft <werkmap>/candidates.json en <werkmap>/sheet-XX.jpg.
"""
import io, json, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont

UA = 'WeegschaalAssetBot/0.1 (educational game asset collection)'
API = 'https://commons.wikimedia.org/w/api.php'
OK_LICENSES = ('cc0', 'public domain', 'pd', 'cc by', 'cc-by')

QUERIES = {
  'eurocent': '1 euro cent coin', 'euro-2': '2 euro coin common side', 'a4-blad': 'blank sheet of paper A4 white',
  'kippenei': 'chicken egg', 'tennisbal': 'tennis ball', 'golfbal': 'golf ball',
  'pingpongbal': 'table tennis ball white', 'blikje-frisdrank': 'soda can', 'aa-batterij': 'AA battery',
  'fles-water': 'water bottle plastic', 'smartphone': 'iPhone 15', 'voetbal': 'association football ball',
  'basketbal': 'basketball ball isolated', 'baksteen': 'red brick isolated', 'shuttle': 'shuttlecock feather badminton',
  'olympische-medaille': 'Paris 2024 gold medal', 'mensenbrein': 'human brain anatomical specimen', 'mensenhart': 'human heart anatomical model',
  'speer': 'javelin athletics', 'discus': 'discus throw discus', 'bijkolibrie': 'bee hummingbird Mellisuga helenae',
  'honkbal': 'baseball ball', 'volleybal': 'volleyball ball', 'kogel': 'shot put ball', 'halterstang': 'olympic barbell bar',
  'zak-cement': 'cement bag', 'curlingsteen': 'curling stone', 'kegel': 'bowling pin', 'struisvogelei': 'ostrich egg',
  'hart-vinvis': 'blue whale heart', 'pasgeborene': 'newborn baby', 'huismuis': 'house mouse Mus musculus', 'wasmachine': 'front load washing machine',
  'concertvleugel': 'Steinway concert grand piano', 'smart': 'Smart Fortwo first generation', 'liberty-bell': 'Liberty Bell Philadelphia',
  'nijlpaard': 'hippopotamus amphibius standing', 'zeecontainer': '20 ft shipping container', 'olifant': 'African bush elephant bull',
  'trex': 'Tyrannosaurus rex skeleton', 'big-ben': 'Big Ben bell Great Bell', 'leeuw-waterloo': 'Lion Mound Waterloo lion statue',
  'vrachtwagen': 'semi-trailer truck Europe', 'boeing-737': 'Boeing 737-800 takeoff', 'blauwe-vinvis': 'blue whale Balaenoptera musculus',
  'iss': 'International Space Station STS', 'a380': 'Airbus A380 takeoff', 'olympisch-zwembad': 'olympic swimming pool 50 m',
  'atomium': 'Atomium Brussels', 'saturn-v': 'Saturn V rocket launch Apollo', 'eiffeltoren': 'Eiffel Tower Paris',
}

def api(params):
  params = {**params, 'format': 'json'}
  url = API + '?' + urllib.parse.urlencode(params)
  for attempt in range(8):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
      body = urllib.request.urlopen(req, timeout=30).read().decode()
      if body.startswith('{'):
        d = json.loads(body)
        if 'error' not in d:
          return d
        body = json.dumps(d['error'])
    except Exception as e:
      body = str(e)
    time.sleep(30 + attempt * 20)
  raise RuntimeError('API faalt: ' + body[:200])

def fetch(url):
  for attempt in range(6):
    try:
      return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read()
    except Exception:
      time.sleep(10 + attempt * 10)
  return None

def license_ok(meta):
  lic = (meta.get('LicenseShortName', {}).get('value') or '').lower()
  return any(lic.startswith(x) for x in OK_LICENSES) and 'nc' not in lic and 'nd' not in lic

def candidates(q, n=6):
  # 1) lichte zoekopdracht (titels, breedte, mime) — wordt minder snel afgeremd
  d = api({'action': 'query', 'list': 'search', 'srsearch': f'{q} filetype:bitmap', 'srnamespace': '6', 'srlimit': '15'})
  titles = [r['title'] for r in d.get('query', {}).get('search', []) if r['title'].lower().endswith(('.jpg', '.jpeg', '.png'))]
  out = []
  # 2) licentie en thumbnail in kleine pakketjes
  for k in range(0, len(titles), 5):
    time.sleep(8)
    batch = titles[k:k + 5]
    info = api({'action': 'query', 'titles': '|'.join(batch), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime',
                'iiurlwidth': '300', 'iiextmetadatafilter': 'LicenseShortName|Artist'})
    pages = {p['title']: p for p in info.get('query', {}).get('pages', {}).values()}
    for t in batch:
      p = pages.get(t)
      if not p: continue
      ii = (p.get('imageinfo') or [{}])[0]
      meta = ii.get('extmetadata', {})
      if ii.get('mime') not in ('image/jpeg', 'image/png') or not license_ok(meta) or ii.get('width', 0) < 600:
        continue
      out.append({'title': t, 'thumb': ii['thumburl'], 'url': ii['url'], 'page': ii.get('descriptionurl'),
                  'license': meta.get('LicenseShortName', {}).get('value'), 'artist': meta.get('Artist', {}).get('value', '')})
      if len(out) >= n: return out
  return out

def main():
  work = sys.argv[1]
  ids = sys.argv[2:] or list(QUERIES)
  path = f'{work}/candidates.json'
  try: allc = json.load(open(path))
  except FileNotFoundError: allc = {}
  for oid in ids:
    if oid in allc and allc[oid]: continue
    allc[oid] = candidates(QUERIES[oid])
    print(oid, len(allc[oid]), flush=True)
    json.dump(allc, open(path, 'w'), indent=1)
    time.sleep(12)
  # contactsheets: 4 voorwerpen per blad, 6 kandidaten per rij
  font = ImageFont.load_default()
  done = [i for i in ids if allc.get(i)]
  T = 200
  for s in range(0, len(done), 4):
    chunk = done[s:s+4]
    sheet = Image.new('RGB', (6 * T, len(chunk) * (T + 24)), 'white')
    dr = ImageDraw.Draw(sheet)
    for r, oid in enumerate(chunk):
      dr.text((4, r * (T + 24) + 4), oid, fill='black', font=font)
      for c, cand in enumerate(allc[oid]):
        raw = fetch(cand['thumb']); time.sleep(1)
        if not raw: continue
        im = Image.open(io.BytesIO(raw)).convert('RGB'); im.thumbnail((T - 6, T - 6))
        x, y = c * T, r * (T + 24) + 20
        sheet.paste(im, (x + 3, y + 3))
        dr.rectangle([x, y, x + 22, y + 16], fill='yellow'); dr.text((x + 6, y + 2), str(c), fill='black', font=font)
    sheet.save(f'{work}/sheet-{s // 4:02d}.jpg', quality=80)
    print('sheet', s // 4, flush=True)

main()
