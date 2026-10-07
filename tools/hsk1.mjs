// `npm run hsk1`: hsk1/items.tsv → META.items in index.html (example word with pinyin and translation,
// "В уроке", parts, stroke hint, pinyin/audio fixes, text to speak instead of a recording).
// The word's pinyin comes from tools/pinyin.mjs, so it matches the pinyin of the sentences.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TOOLS, PICKS, META, charLv, lessonOf, lessonChars, isHan, loadHsk } from "./common.mjs";
import { makePinyin } from "./pinyin.mjs";

const file = path.join(TOOLS, "hsk1", "items.tsv");
const rows = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#")).map(l => l.split("\t"));
const toPinyin = makePinyin(loadHsk(), JSON.parse(fs.readFileSync(PICKS, "utf8")).lex);

const errors = [], seen = new Set();
for (const [c, w, wm, ln, parts, hint, p, a, say] of rows) {
  seen.add(c);
  if (charLv[c] !== 1) { errors.push(`${c}: not an HSK 1 character`); continue; }
  if (!w || !w.includes(c)) errors.push(`${c}: word "${w}" does not contain the character`);
  const late = [...(w || "")].filter(ch => isHan(ch) && !lessonChars[lessonOf[c]].has(ch));
  if (late.length) errors.push(`${c} (урок ${lessonOf[c]}): word ${w} uses ${late.join("")} — not yet taught`);
  if (!wm) errors.push(`${c}: no word translation`);
  if (!parts) errors.push(`${c}: no parts`);
  if (say && !say.includes(c)) errors.push(`${c}: text to speak "${say}" does not contain the character`);
  const it = META.items[c];
  it.w = w; it.wp = toPinyin(w, { sentence: false }); it.wm = wm;
  if (ln) it.ln = ln; else delete it.ln;
  const lw = (ln || "").split(" — ")[0];
  if (ln && /^\p{Script=Han}+$/u.test(lw)) {
    if (!lw.includes(c)) errors.push(`${c}: В уроке "${lw}" does not contain the character`);
    it.lnp = toPinyin(lw, { sentence: false });
  } else delete it.lnp;
  it.parts = parts;
  if (hint) it.hint = hint; else delete it.hint;
  if (p) it.p = p;
  if (a) it.a = a;
  if (say) { it.say = say; delete it.a; } else delete it.say;
}
for (const L of [META.levels[0]]) for (const g of L.modes.lessons) for (const c of g.items) if (!seen.has(c)) errors.push(`${c}: missing in items.tsv`);
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }

const htmlFile = path.join(ROOT, "index.html");
const html = fs.readFileSync(htmlFile, "utf8");
const next = html.replace(/const META = \{.*\};(\r?\n)/, (m, nl) => `const META = ${JSON.stringify(META)};${nl}`);
fs.writeFileSync(htmlFile, next);
console.log(`updated ${rows.length} HSK 1 characters in index.html`);
for (const c of ["客", "不", "们", "候", "十"]) { const it = META.items[c]; console.log(`  ${c}: ${it.w} ${it.wp} — ${it.wm}${it.ln ? " | В уроке: " + it.ln : ""} | ${it.parts}${it.hint ? " | " + it.hint : ""}`); }
