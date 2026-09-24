window.PORTFOLIO_PAGE_SOURCE = {
  "thaum-mono": [
    {
      mediaDir: "source/thaum-mono/2026/1/",
      mediaFiles: {"images":[],"videos":[]},
      sourceText: `# entry-data

## title
Thaum Mono
## preset
custom
## colors
- title: e0e8d0
- subtitle: e36325
- description: 787d8b
- background: 120a1a
- brightness: dark

## html
<div class="tm-slice">
  <p class="tm-tagline">a bitmap pixel typeface in four weights · 12×16 tiles · built from hand-drawn atlas sheets</p>
  <p class="tm-copy">
    Thaum Mono is the monospace typeface behind my renderer, painter, and games.
    Every glyph is drawn by hand as 12×16 pixel tiles — one row per weight — then
    dissolved into installable fonts. Many glyphs interlock with their neighbours
    (borders, blocks, arrows, dots) so they can be assembled into panels, gauges,
    and pictures. The four weights share the same grid, so you can push weight
    without breaking the layout.
  </p>
  <p class="tm-copy">
    This page is a specimen and a playground. Ride the weight slider, hover
    the glyph sheet — and grab the fonts at the bottom.
  </p>
</div>`
    },
    {
      mediaDir: "source/thaum-mono/2026/2/",
      mediaFiles: {"images":[],"videos":[]},
      sourceText: `# entry-data

## title
Specimen
## preset
custom
## colors
- title: e0e8d0
- subtitle: e36325
- description: 787d8b
- background: 120a1a
- brightness: dark

## html
<div class="tm-section">
  <h3 class="tm-heading">weight ride — the variable font</h3>
  <p class="tm-tester-line" data-tm-tester data-tm-text="the quick brown fox jumps over the lazy dog 0123456789 ?!#%&amp;">the quick brown fox jumps over the lazy dog 0123456789 ?!#%&amp;</p>
  <div class="tm-tester-echo tm-morph-vf" data-tm-echo spellcheck="false" contenteditable="true">the quick brown fox jumps over the lazy dog 0123456789 ?!#%&amp;</div>
  <div class="tm-controls">
    <label class="tm-control">weight
      <input type="range" min="80" max="640" step="20" value="320" data-tm-weight>
      <span class="tm-readout" data-tm-weight-out>320</span>
    </label>
  </div>
  <p class="tm-tester-line is-static" data-tm-weights-row></p>
  <h3 class="tm-heading">glyph sheet — hover to push weight</h3>
  <div class="tm-morph-sheet" data-tm-sheet></div>
</div>`
    },
    {
      mediaDir: "source/thaum-mono/2026/3/",
      mediaFiles: {"images":[],"videos":[]},
      sourceText: `# entry-data

## title
Download
## preset
custom
## colors
- title: e0e8d0
- subtitle: e36325
- description: 787d8b
- background: 120a1a
- brightness: dark

## html
<div class="tm-section">
  <h3 class="tm-heading">get the fonts</h3>
  <p class="tm-copy">grab the zip for everything at once — license plus the four installable weights — or take individual weight files. Thaum Mono is MIT licensed, the same terms as the thaum-renderer: free for anything, including commercial work, with credit.</p>
  <div class="tm-download-row">
    <a class="tm-button is-primary" href="/fonts/thaum-mono/ThaumMono-v0.14.zip" download>↓ thaum-mono v0.14 zip</a>
  </div>
  <div class="tm-download-row">
    <a class="tm-button" href="/fonts/thaum-mono/ThaumMono-W80.ttf" download>W80 hairline</a>
    <a class="tm-button" href="/fonts/thaum-mono/ThaumMono-W160.ttf" download>W160 light</a>
    <a class="tm-button" href="/fonts/thaum-mono/ThaumMono-W320.ttf" download>W320 regular</a>
    <a class="tm-button" href="/fonts/thaum-mono/ThaumMono-W640.ttf" download>W640 heavy</a>
    <a class="tm-button" href="/fonts/thaum-mono/LICENSE.md" download>license</a>
  </div>
  <p class="tm-copy">install: drop the .ttf files into your system fonts folder (windows: right-click → install · mac: double-click → install · linux: copy to ~/.local/share/fonts).</p>
</div>`
    }
  ]
};
