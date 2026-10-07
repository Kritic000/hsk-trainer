// `npm run font-gap`: CJK characters of index.html and data/sentences-*.json that the self-hosted
// Noto Serif SC subset (fonts/fonts.css) doesn't cover. If any — run `npm run fonts`.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

const css = fs.readFileSync(path.join(ROOT, "fonts", "fonts.css"), "utf8");
const covered = new Set();
for (const [, ranges] of css.matchAll(/font-family:'Noto Serif SC'[^}]*unicode-range:([^}]+)\}/g))
  for (const r of ranges.split(",")) {
    const [a, b] = r.trim().replace(/^U\+/i, "").split("-").map(x => parseInt(x, 16));
    for (let cp = a; cp <= (b || a); cp++) covered.add(cp);
  }
const files = ["index.html", ...[1, 2, 3, 4, 5, 6].map(l => path.join("data", `sentences-${l}.json`))];
const gap = new Set();
for (const f of files) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) for (const ch of fs.readFileSync(p, "utf8")) if (ch.codePointAt(0) >= 0x2E80 && !covered.has(ch.codePointAt(0))) gap.add(ch);
}
console.log(gap.size ? `${gap.size} characters not in the font: ${[...gap].join("")} — run npm run fonts` : "font covers every character");
