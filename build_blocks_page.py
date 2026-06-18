"""
build_blocks_page.py
Generates blocks/index.html from assets/blocks.json and assets/blocks_index.json.
Run from the repo root: python build_blocks_page.py
"""
import json, math, html as html_mod

BASE = "D:/Projects/minecraft-tools"

with open(f"{BASE}/assets/blocks.json", encoding="utf-8") as f:
    db = json.load(f)

with open(f"{BASE}/assets/blocks_index.json", encoding="utf-8") as f:
    block_index = json.load(f)

SPRITE_COLS = 15
TILE = 32  # display size (2x)

categories_order = list(db["categories"].keys())
categories_display = db["categories"]

# Group blocks by category
groups = {k: [] for k in categories_order}
for block in db["blocks"]:
    cat = block.get("category", "misc")
    if cat not in groups:
        groups[cat] = []
    groups[cat].append(block)

def sprite_style(block_id):
    idx = block_index.get(block_id)
    if idx is None:
        return ""
    x = (idx % SPRITE_COLS) * TILE
    y = math.floor(idx / SPRITE_COLS) * TILE
    return f"background-position: -{x}px -{y}px;"

# Build TOC links
toc_items = []
for cat in categories_order:
    if not groups.get(cat):
        continue
    label = html_mod.escape(categories_display.get(cat, cat))
    toc_items.append(f'<li><a href="#{cat}">{label}</a></li>')
toc_html = "\n        ".join(toc_items)

# Build category sections
sections = []
for cat in categories_order:
    blocks = groups.get(cat, [])
    if not blocks:
        continue
    label = html_mod.escape(categories_display.get(cat, cat))
    cards = []
    for block in blocks:
        name = html_mod.escape(block["name"])
        style = sprite_style(block["id"])
        cards.append(
            f'<div class="block-card">'
            f'<div class="block-sprite" style="{style}"></div>'
            f'<span>{name}</span>'
            f'</div>'
        )
    cards_html = "\n          ".join(cards)
    sections.append(f"""  <section id="{cat}">
    <h2>{label}</h2>
    <div class="block-grid">
      {cards_html}
    </div>
  </section>""")

sections_html = "\n\n".join(sections)

total_blocks = len(db["blocks"])

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Minecraft Blocks BlockForge Supports ({total_blocks} Block Palette)</title>
  <meta name="description" content="Complete reference of every Minecraft block BlockForge can target, grouped by material. {total_blocks} blocks across wool, concrete, terracotta, wood, stone, more.">
  <link rel="canonical" href="https://blockforge.saturnitystools.com/blocks/">

  <meta property="og:type" content="website">
  <meta property="og:url" content="https://blockforge.saturnitystools.com/blocks/">
  <meta property="og:title" content="All Minecraft Blocks BlockForge Supports ({total_blocks} Block Palette)">
  <meta property="og:description" content="Complete reference of every Minecraft block BlockForge can target, grouped by material. {total_blocks} blocks across wool, concrete, terracotta, wood, stone, more.">
  <meta property="og:image" content="https://blockforge.saturnitystools.com/assets/img/og-image.png">
  <meta property="og:site_name" content="Saturnity Minecraft Tools">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="All Minecraft Blocks BlockForge Supports ({total_blocks} Block Palette)">
  <meta name="twitter:description" content="Complete reference of every Minecraft block BlockForge can target, grouped by material. {total_blocks} blocks across wool, concrete, terracotta, wood, stone, more.">
  <meta name="twitter:image" content="https://blockforge.saturnitystools.com/assets/img/og-image.png">

  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <script src="/assets/js/consent.js?v=2" defer></script>
  <link rel="stylesheet" href="/assets/css/site.css">

  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "BlockForge Supported Blocks",
    "url": "https://blockforge.saturnitystools.com/blocks/",
    "description": "Every Minecraft block BlockForge can target in image-to-schematic conversion.",
    "numberOfItems": {total_blocks}
  }}
  </script>
</head>
<body>

<header class="site-header">
  <a href="/" class="brand">
    <img src="/favicon.svg" alt="" width="28" height="28">
    <span>Saturnity Minecraft Tools</span>
  </a>
  <nav>
    <a href="/">Home</a>
    <a href="/app/">BlockForge</a>
    <a href="/guide/">Guide</a>
    <a href="/showcase/">Showcase</a>
    <a href="/blocks/" class="active">Blocks</a>
    <a href="/faq/">FAQ</a>
  </nav>
</header>

<main>
  <h1>All Blocks BlockForge Supports</h1>
  <p class="lead">BlockForge can target every block listed below, {total_blocks} in total. They are grouped by material so you can filter the palette in the app down to a single category and get a clean aesthetic.</p>

  <nav class="blocks-toc">
    <h2>Jump to category</h2>
    <ul>
        {toc_html}
    </ul>
  </nav>

{sections_html}

  <section class="cta-block">
    <h2>Use the palette</h2>
    <p>Open <a href="/app/">BlockForge</a> and filter the palette down to the category you want.</p>
  </section>
</main>

<footer class="site-footer">
  <div class="footer-cols">
    <div>
      <strong>Saturnity Minecraft Tools</strong>
      <p>Free browser tools for Minecraft builders.</p>
    </div>
    <div>
      <strong>Tools</strong>
      <ul>
        <li><a href="/app/">BlockForge</a></li>
        <li><a href="/guide/">How-to guide</a></li>
        <li><a href="/blocks/">Block reference</a></li>
      </ul>
    </div>
    <div>
      <strong>From Saturnity</strong>
      <ul>
        <li><a href="https://saturnitystools.com/" rel="noopener">All Saturnity tools</a></li>
        <li><a href="https://saturnitystools.com/contact/" rel="noopener">Contact</a></li>
        <li><a href="https://ko-fi.com/saturnity" rel="noopener">Support on Ko-Fi</a></li>
      </ul>
    </div>
    <div>
      <strong>Legal</strong>
      <ul>
        <li><a href="https://saturnitystools.com/privacy-policy/" rel="noopener">Privacy policy</a></li>
        <li><a href="https://saturnitystools.com/terms/" rel="noopener">Terms</a></li>
        <li><button type="button" onclick="window.SatConsent && window.SatConsent.reset()">Reset cookie preferences</button></li>
      </ul>
    </div>
  </div>
  <div class="footer-credit">
    Made by <a href="https://saturnitystools.com/" rel="noopener">Saturnity</a>.
  </div>
</footer>
</body>
</html>
"""

out_path = f"{BASE}/blocks/index.html"
with open(out_path, "w", encoding="utf-8") as f:
    f.write(page)

print(f"Written: {out_path}")
print(f"Total blocks: {total_blocks}")
print(f"Categories: {len([c for c in categories_order if groups.get(c)])}")
