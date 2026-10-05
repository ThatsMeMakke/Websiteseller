"""Baut die Seite aus index.html (Quelle) und den Bildern in img/.

Bilder: img/<schluessel>.png oder .jpg ablegen, z. B. img/start.png.
Schluessel: start, terras, radweg, veen, huis-buiten, woonkamer, keuken, slaapkamer, badkamer.

Ergebnis:
  dist/            fertige Website (index.html + img/) zum Hochladen
  preview.html     Vorschau mit eingebetteten Bildern (fuer den Vorschau-Link)
"""
import base64, io, json, pathlib, re, shutil
from PIL import Image

ROOT = pathlib.Path(__file__).parent
SRC, IMG, DIST = ROOT / 'index.html', ROOT / 'img', ROOT / 'dist'
WIDE = {'start': 2000, 'veen': 2000}

HEAD = '''<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="canonical" href="https://www.vakantiewoningdesteen.nl/">
<meta property="og:type" content="website">
<meta property="og:title" content="Vakantiewoning De Steen · Winterswijk-Woold">
<meta property="og:description" content="Vakantiewoning voor 4 personen in het coulisselandschap van Winterswijk. Alles gelijkvloers, tuin met terras.">
<meta property="og:url" content="https://www.vakantiewoningdesteen.nl/">
{og_image}
<script type="application/ld+json">{ld}</script>
'''

LD = {
  "@context": "https://schema.org", "@type": "LodgingBusiness",
  "name": "Vakantiewoning De Steen", "url": "https://www.vakantiewoningdesteen.nl/",
  "telephone": "+31621977876", "email": "info@vakantiewoningdesteen.nl",
  "address": {"@type": "PostalAddress", "streetAddress": "Wooldseweg 104", "postalCode": "7108 AB",
              "addressLocality": "Winterswijk-Woold", "addressCountry": "NL"},
  "priceRange": "€300 – €425", "numberOfRooms": 2, "petsAllowed": False, "smokingAllowed": False,
  "checkinTime": "14:00", "checkoutTime": "10:00",
}

def find_image(key):
    for ext in ('png', 'jpg', 'jpeg', 'webp'):
        p = IMG / f'{key}.{ext}'
        if p.exists():
            return p

def encode(path, width, quality):
    im = Image.open(path).convert('RGB')
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue()

def build(embed):
    html = SRC.read_text(encoding='utf8')
    used = []
    def swap(m):
        tag, key, alt, inner = m.group(1), m.group(2), m.group(3), m.group(4)
        p = find_image(key)
        if not p:
            return m.group(0)
        width = WIDE.get(key, 1400)
        if embed:
            data = base64.b64encode(encode(p, min(width, 1400), 72)).decode()
            src = f'data:image/jpeg;base64,{data}'
        else:
            (DIST / 'img').mkdir(parents=True, exist_ok=True)
            (DIST / 'img' / f'{key}.jpg').write_bytes(encode(p, width, 80))
            src = f'img/{key}.jpg'
        used.append(key)
        lazy = '' if key == 'start' else ' loading="lazy"'
        return f'{tag}<img src="{src}" alt="{alt}"{lazy} decoding="async">'
    html = re.sub(r'(<[^>]*data-img="([^"]+)" data-alt="([^"]*)"[^>]*>)\s*<!--ph-->(.*?)<!--/ph-->', swap, html, flags=re.S)
    return html, used

if __name__ == '__main__':
    shutil.rmtree(DIST / 'img', ignore_errors=True)
    preview, used = build(embed=True)
    (ROOT / 'preview.html').write_text(preview, encoding='utf8')
    site, _ = build(embed=False)
    og = '<meta property="og:image" content="https://www.vakantiewoningdesteen.nl/img/start.jpg">' if 'start' in used else ''
    head = HEAD.format(og_image=og, ld=json.dumps(LD, ensure_ascii=False))
    # <title> und <meta description> stehen schon oben in index.html und landen so im <head>
    body_start = site.index('<div data-lang=')
    DIST.mkdir(exist_ok=True)
    (DIST / 'index.html').write_text(head + site[:body_start] + '</head>\n<body>\n' + site[body_start:] + '\n</body>\n</html>\n', encoding='utf8')
    print('Bilder eingebaut:', ', '.join(used) or 'keine')
