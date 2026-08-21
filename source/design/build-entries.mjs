import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const years = await readdir(rootDir, { withFileTypes: true });
const numericName = /^\d+$/;
const mediaName = /^(image|video)-(\d+)\.(png|jpe?g|webp|gif|svg|mp4|webm|mov)$/i;

const orderFiles = (files) => files.sort((a, b) => {
  const aMatch = a.match(mediaName);
  const bMatch = b.match(mediaName);
  const aIndex = Number(aMatch?.[2] || 0);
  const bIndex = Number(bMatch?.[2] || 0);
  return aIndex - bIndex || a.localeCompare(b);
});

function parseEntryMarkdown(sourceText) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const entry = {};
  let section = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      if (!(section in entry)) entry[section] = "";
      continue;
    }
    if (!section) continue;
    entry[section] = entry[section] ? `${entry[section]}\n${line}` : line;
  }
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.trim()]));
}

function parseColorConfig(sourceText) {
  const config = {};
  if (!sourceText) return config;
  for (const line of sourceText.split("\n")) {
    const match = line.match(/^\s*[-*]\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    config[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return config;
}

function assertCarouselItemColors(sourceText, mediaFiles, entryPath) {
  const entry = parseEntryMarkdown(sourceText);
  if ((entry.preset || "").trim().toLowerCase() !== "carousel-media") return;
  if (entry.colors) {
    throw new Error(`${entryPath}: carousel-media must not include ## colors; use only ## item N colors sections`);
  }
  const requiredKeys = ["title", "subtitle", "description", "background", "brightness"];
  const imageCount = mediaFiles.filter((name) => /^image-/i.test(name)).length;
  for (let itemIndex = 0; itemIndex < imageCount; itemIndex += 1) {
    const sectionName = `item ${itemIndex + 1} colors`;
    const colorConfig = parseColorConfig(entry[sectionName] || "");
    const missingKeys = requiredKeys.filter((key) => !colorConfig[key]);
    if (missingKeys.length) {
      throw new Error(`${entryPath}: carousel-media requires ## ${sectionName} with ${requiredKeys.join(", ")}`);
    }
  }
}

const entries = [];
for (const yearDir of years) {
  if (!yearDir.isDirectory() || !numericName.test(yearDir.name)) continue;
  const yearPath = path.join(rootDir, yearDir.name);
  const sliceDirs = await readdir(yearPath, { withFileTypes: true });
  for (const sliceDir of sliceDirs) {
    if (!sliceDir.isDirectory() || !numericName.test(sliceDir.name)) continue;
    const order = Number(sliceDir.name);
    const mediaDir = `source/design/${yearDir.name}/${sliceDir.name}/`;
    const folderPath = path.join(yearPath, sliceDir.name);
    const entryPath = path.join(folderPath, 'entry.md');
    let sourceText;
    try {
      sourceText = await readFile(entryPath, 'utf8');
    } catch {
      continue;
    }
    const folderFiles = await readdir(folderPath);
    const mediaFiles = orderFiles(folderFiles.filter((name) => mediaName.test(name)));
    assertCarouselItemColors(sourceText, mediaFiles, entryPath);
    entries.push({
      order,
      year: Number(yearDir.name),
      mediaDir,
      mediaFiles: {
        images: mediaFiles.filter((name) => /^image-/i.test(name)).map((name) => `${mediaDir}${name}`),
        videos: mediaFiles.filter((name) => /^video-/i.test(name)).map((name) => `${mediaDir}${name}`),
      },
      sourceText,
    });
  }
}

entries.sort((a, b) => a.order - b.order || b.year - a.year || a.mediaDir.localeCompare(b.mediaDir));
const dedupedEntries = [];
const usedOrders = new Set();
for (const entry of entries) {
  if (usedOrders.has(entry.order)) continue;
  usedOrders.add(entry.order);
  dedupedEntries.push(entry);
}

const escapeTemplate = (text) => text.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const content = `window.PORTFOLIO_PAGE_SOURCE = {\n  design: [\n${dedupedEntries.map((entry) => `    {\n      mediaDir: ${JSON.stringify(entry.mediaDir)},\n      mediaFiles: ${JSON.stringify(entry.mediaFiles)},\n      sourceText: \`${escapeTemplate(entry.sourceText)}\`\n    }`).join(',\n')}\n  ]\n};\n`;

await writeFile(path.join(rootDir, 'entries.js'), content);
