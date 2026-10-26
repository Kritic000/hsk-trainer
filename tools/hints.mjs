// `npm run hints`: hints/hsk1.tsv → data/hints-1.json — what a character of HSK 1 is made of and a short hint
// to remember it (the card under the square in «Знаки» and after an answer in «Узнай знак»).
// Checks: every character of HSK 1 has exactly one line; the hint (optional) is short and uses only characters
// of the app's dictionary or of the parts (no full forms like 關 or 學).
// Also hints/similar.txt → "s": groups of characters easy to confuse, with what tells each one apart.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TOOLS, META } from "./common.mjs";

const LAYOUT = { "⿰": "слева направо", "⿲": "слева направо", "⿱": "сверху вниз", "⿳": "сверху вниз", "⿴": "снаружи и внутри", "⿵": "в рамке", "⿶": "в рамке", "⿷": "в рамке", "⿸": "в уголке", "⿹": "в уголке", "⿺": "в уголке", "⿻": "наложены" };
const src = path.join(TOOLS, "hints", "hsk1.tsv");
const want = META.levels[0].modes.lessons.flatMap(g => g.items);
const rows = fs.readFileSync(src, "utf8").split(/\r?\n/);
const isHan = ch => /\p{Script=Han}/u.test(ch);
// every part named in the file: a hint may use them (亻, 冂, 灬…)
const partChars = new Set(rows.filter(l => !l.startsWith("#")).flatMap(l => [...(l.split("\t")[2] || "")]));
const out = {}, errors = [];
rows.forEach((line, i) => {
  if (!line.trim() || line.startsWith("#")) return;
  const at = `строка ${i + 1}`;
  const [c, ids = "", parts = "", text = ""] = line.split("\t").map(x => x.trim());
  if (!want.includes(c)) return errors.push(`${at}: ${c} — не знак HSK 1`);
  if (out[c]) return errors.push(`${at}: ${c} уже был`);
  if (text.split(/\s+/).length > 12) errors.push(`${at}: ${c} — подсказка длиннее ~10 слов`);
  const odd = [...text].filter(ch => isHan(ch) && !META.items[ch] && !partChars.has(ch));
  if (odd.length) errors.push(`${at}: ${c} — в подсказке знаки не из словаря: ${odd.join("")}`);
  // «女 женщина; 子 ребёнок»: the part and what it means; «冉» alone or «冉 冉» — no meaning to show
  const p = parts ? parts.split(/\s*;\s*/).filter(Boolean).map(x => {
    const [part, ...rest] = x.split(" "), gloss = rest.join(" ").trim();
    return gloss && !gloss.startsWith(part) ? [part, gloss] : gloss.startsWith(part) && gloss.length > part.length ? [part, gloss.slice(part.length).trim()] : [part];
  }) : [];
  const e = {};
  if (text) e.t = text;
  // how the parts stand, from the first sign of the decomposition
  const l = LAYOUT[[...ids][0]];
  if (l && p.length) e.l = l;
  if (p.length) e.p = p;
  out[c] = e;
});
want.filter(c => !out[c]).forEach(c => errors.push(`нет строки для ${c}`));

// similar characters: hints/similar.txt — groups of lines «character ⇥ how it differs», a blank line between groups
const groups = [];
let cur = [];
const flush = at => {
  if (!cur.length) return;
  const cs = cur.map(x => x[0]).join("");
  if (cur.length < 2 || cur.length > 4) errors.push(`similar.txt, ${at}: в группе ${cs} ${cur.length} знак(а), нужно 2–4`);
  if (new Set(cur.map(x => x[0])).size !== cur.length) errors.push(`similar.txt, ${at}: знак повторяется в группе ${cs}`);
  groups.push(cur); cur = [];
};
fs.readFileSync(path.join(TOOLS, "hints", "similar.txt"), "utf8").split(/\r?\n/).forEach((line, i) => {
  if (line.startsWith("#")) return;
  if (!line.trim()) return flush(`строка ${i + 1}`);
  const [c, note = ""] = line.split("\t").map(x => x.trim());
  if (!META.items[c]) errors.push(`similar.txt, строка ${i + 1}: ${c} — нет в словаре приложения`);
  if (!note) errors.push(`similar.txt, строка ${i + 1}: ${c} — нет пояснения`);
  cur.push([c, note]);
});
flush("конец файла");
const sig = new Set();
groups.forEach(g => { const k = g.map(x => x[0]).sort().join(""); if (sig.has(k)) errors.push(`similar.txt: группа ${k} повторяется`); sig.add(k); });

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
const json = "{\"c\":{\n" + want.map(c => JSON.stringify(c) + ":" + JSON.stringify(out[c])).join(",\n") + "\n},\n\"s\":[\n" + groups.map(g => JSON.stringify(g)).join(",\n") + "\n]}\n";
fs.writeFileSync(path.join(ROOT, "data", "hints-1.json"), json);
console.log(`data/hints-1.json: ${want.length} знаков, с подсказкой ${want.filter(c => out[c].t).length}; похожих групп ${groups.length}`);
