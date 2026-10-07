// `npm run fonts`: downloads Golos Text (all subsets) and a Noto Serif SC subset containing every
// CJK character of index.html and data/sentences-*.json, writes fonts/*.woff2 and fonts/fonts.css.
// After it: check the file list in sw.js (SHELL_FILES) and bump SHELL_VERSION.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

const root = ROOT;
const outDir = path.join(root, "fonts");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const get = async (url, bin) => {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
};

let css = "/* Generated from Google Fonts (OFL). Self-hosted for offline use. */\n";

// ---- Golos Text: variable font, same files for 400–700
const golos = await get("https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..700&display=swap");
const blocks = [...golos.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]+)\}/g)];
for (const [, subset, body] of blocks) {
  const url = body.match(/url\((.+?)\)/)[1];
  const file = `golos-${subset}.woff2`;
  fs.writeFileSync(path.join(outDir, file), await get(url, true));
  css += `@font-face{font-family:'Golos Text';font-style:normal;font-weight:400 700;font-display:swap;src:url(${file}) format('woff2');unicode-range:${body.match(/unicode-range:\s*([^;]+);/)[1]}}\n`;
}

// ---- Noto Serif SC: subset to the CJK characters used by the app
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const chars = [...new Set([...html].filter(ch => ch.codePointAt(0) >= 0x2E80))].sort();
const CHUNK = 400;
let n = 0;
// Latin, pinyin tone letters and Cyrillic: Noto Serif SC has them, and .han text mixes them in
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));
// …plus CJK characters that occur only in the example sentences (so far just Chinese punctuation),
// kept in this last file so the big character files don't change
const inSentences = new Set();
for (let l = 1; l <= 6; l++) {
  const f = path.join(root, "data", `sentences-${l}.json`);
  if (fs.existsSync(f)) [...fs.readFileSync(f, "utf8")].forEach(ch => { if (ch.codePointAt(0) >= 0x2E80 && !chars.includes(ch)) inSentences.add(ch); });
}
const western = [...range(0x20, 0x7E), ...range(0xA0, 0xFF), ..."āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ", ...range(0x400, 0x45F), ..."—–«»…“”‘’·№", ...inSentences].join("");
const chunks = [];
for (let i = 0; i < chars.length; i += CHUNK) chunks.push(chars.slice(i, i + CHUNK).join(""));
chunks.push(western);
for (const text of chunks) {
  const sheet = await get(`https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500..700&display=swap&text=${encodeURIComponent(text)}`);
  for (const [, body] of sheet.matchAll(/@font-face \{([^}]+)\}/g)) {
    const url = body.match(/url\((.+?)\)/)[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)[1];
    const file = `noto-serif-sc-${String(n++).padStart(2, "0")}.woff2`;
    fs.writeFileSync(path.join(outDir, file), await get(url, true));
    css += `@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:500 700;font-display:swap;src:url(${file}) format('woff2');unicode-range:${range}}\n`;
  }
}
fs.writeFileSync(path.join(outDir, "fonts.css"), css);
console.log(`chars: ${chars.length}, noto files: ${n}`);
for (const f of fs.readdirSync(outDir)) console.log(f, fs.statSync(path.join(outDir, f)).size);
