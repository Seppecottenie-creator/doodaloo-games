"""Kandidaatfoto's uit Engelstalige Wikipedia-artikels (door mensen gekozen, meestal op Commons).

Gebruik: python3 -I scripts/wiki_candidates.py <werkmap> [id ...]
Voegt kandidaten vooraan toe in <werkmap>/wcands.json.
"""
import json, sys, time, urllib.parse, urllib.request

UA = 'WeegschaalAssetBot/0.1 (educational game asset collection)'
API = 'https://en.wikipedia.org/w/api.php'
OK = ('cc0', 'public domain', 'pd', 'cc by', 'cc-by')

ARTICLES = {
  'eurocent': ['1 cent euro coin'], 'euro-2': ['2 euro coin'], 'a4-blad': ['Paper'], 'kippenei': ['Egg as food', 'Chicken egg'],
  'tennisbal': ['Tennis ball'], 'golfbal': ['Golf ball'], 'pingpongbal': ['Table tennis'], 'blikje-frisdrank': ['Beverage can'],
  'aa-batterij': ['AA battery'], 'fles-water': ['Bottled water'], 'smartphone': ['iPhone 15'], 'voetbal': ['Ball (association football)'],
  'basketbal': ['Basketball (ball)'], 'baksteen': ['Brick'], 'shuttle': ['Shuttlecock'], 'olympische-medaille': ['2024 Summer Olympics medals', 'Olympic medal'],
  'mensenbrein': ['Human brain'], 'mensenhart': ['Heart'], 'speer': ['Javelin throw'], 'discus': ['Discus throw'], 'bijkolibrie': ['Bee hummingbird'],
  'honkbal': ['Baseball (ball)'], 'volleybal': ['Volleyball (ball)'], 'kogel': ['Shot put'], 'halterstang': ['Barbell'], 'zak-cement': ['Cement'],
  'curlingsteen': ['Curling'], 'kegel': ['Bowling pin'], 'struisvogelei': ['Common ostrich'], 'hart-vinvis': ['Blue whale'], 'pasgeborene': ['Infant'],
  'huismuis': ['House mouse'], 'wasmachine': ['Washing machine'], 'concertvleugel': ['Grand piano'], 'smart': ['Smart Fortwo'],
  'liberty-bell': ['Liberty Bell'], 'nijlpaard': ['Hippopotamus'], 'zeecontainer': ['Intermodal container'], 'olifant': ['African bush elephant'],
  'trex': ['Tyrannosaurus'], 'big-ben': ['Big Ben'], 'leeuw-waterloo': ["Lion's Mound"], 'vrachtwagen': ['Semi-trailer truck'],
  'boeing-737': ['Boeing 737 Next Generation'], 'blauwe-vinvis': ['Blue whale'], 'iss': ['International Space Station'], 'a380': ['Airbus A380'],
  'olympisch-zwembad': ['Olympic-size swimming pool'], 'atomium': ['Atomium'], 'saturn-v': ['Saturn V'], 'eiffeltoren': ['Eiffel Tower'],
}

def api(params):
  url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json'})
  for attempt in range(8):
    try:
      body = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read().decode()
      if body.startswith('{'):
        d = json.loads(body)
        if 'error' not in d: return d
    except Exception:
      pass
    time.sleep(20 + attempt * 15)
  return {}

def ok(meta):
  lic = (meta.get('LicenseShortName', {}).get('value') or '').lower()
  return any(lic.startswith(x) for x in OK) and 'nc' not in lic and 'nd' not in lic

def for_article(title):
  lead = api({'action': 'query', 'titles': title, 'prop': 'pageimages', 'piprop': 'name', 'redirects': 1})
  leads = [p.get('pageimage') for p in lead.get('query', {}).get('pages', {}).values() if p.get('pageimage')]
  time.sleep(3)
  d = api({'action': 'query', 'generator': 'images', 'titles': title, 'gimlimit': '25', 'redirects': 1, 'prop': 'imageinfo',
           'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': '300', 'iiextmetadatafilter': 'LicenseShortName|Artist'})
  out = []
  for p in d.get('query', {}).get('pages', {}).values():
    ii = (p.get('imageinfo') or [{}])[0]
    meta = ii.get('extmetadata', {})
    if ii.get('mime') not in ('image/jpeg', 'image/png') or ii.get('width', 0) < 500 or not ok(meta):
      continue
    name = p['title'].split(':', 1)[1].replace(' ', '_')
    out.append({'title': p['title'], 'thumb': ii['thumburl'], 'url': ii['url'], 'page': ii.get('descriptionurl'),
                'license': meta.get('LicenseShortName', {}).get('value'), 'artist': meta.get('Artist', {}).get('value', ''),
                'lead': name in leads})
  out.sort(key=lambda c: not c['lead'])
  return out

def main():
  work = sys.argv[1]
  ids = sys.argv[2:] or list(ARTICLES)
  path = f'{work}/wcands.json'
  try: allc = json.load(open(path))
  except FileNotFoundError: allc = {}
  for oid in ids:
    if allc.get(oid): continue
    res = []
    for art in ARTICLES[oid]:
      res += for_article(art)
      time.sleep(3)
    allc[oid] = res[:6]
    json.dump(allc, open(path, 'w'), indent=1)
    print(oid, len(res), flush=True)

main()
