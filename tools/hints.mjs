// `npm run hints`: hints/hsk1.tsv → data/hints-1.json — what a character of HSK 1 is made of and how to
// remember it (the card under the square in «Знаки» and after an answer in «Узнай знак»).
// Checks: every character of HSK 1 has exactly one line, the kind is known, the text is there.
// Also hints/similar.txt → "s": groups of characters easy to confuse, with what tells each one apart.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TOOLS, META } from "./common.mjs";

const KIND = { "о": "o", "з": "z", "п": "p" };
const LAYOUT = { "⿰": "слева направо", "⿲": "слева направо", "⿱": "сверху вниз", "⿳": "сверху вниз", "⿴": "снаружи и внутри", "⿵": "в рамке", "⿶": "в рамке", "⿷": "в рамке", "⿸": "в уголке", "⿹": "в уголке", "⿺": "в уголке", "⿻": "наложены" };
const src = path.join(TOOLS, "hints", "hsk1.tsv");
const want = META.levels[0].modes.lessons.flatMap(g => g.items);
const out = {}, errors = [];
fs.readFileSync(src, "utf8").split(/\r?\n/).forEach((line, i) => {
  if (!line.trim() || line.startsWith("#")) return;
  const at = `строка ${i + 1}`;
  const [c, ids = "", parts = "", kind = "", text = ""] = line.split("\t").map(x => x.trim());
  if (!want.includes(c)) return errors.push(`${at}: ${c} — не знак HSK 1`);
  if (out[c]) return errors.push(`${at}: ${c} уже был`);
  if (!KIND[kind]) return errors.push(`${at}: ${c} — вид «${kind}», нужен о, з или п`);
  if (!text) return errors.push(`${at}: ${c} — нет текста`);
  if (text.length > 200) errors.push(`${at}: ${c} — текст длиннее 200 знаков (${text.length})`);
  // «女 женщина; 子 ребёнок»: the part and what it means; «冉» alone or «冉 冉» — no meaning to show
  const p = parts ? parts.split(/\s*;\s*/).filter(Boolean).map(x => {
    const [part, ...rest] = x.split(" "), gloss = rest.join(" ").trim();
    return gloss && !gloss.startsWith(part) ? [part, gloss] : gloss.startsWith(part) && gloss.length > part.length ? [part, gloss.slice(part.length).trim()] : [part];
  }) : [];
  const e = { k: KIND[kind], t: text };
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
const n = k => want.filter(c => out[c].k === k).length;
console.log(`data/hints-1.json: ${want.length} знаков — происхождение ${n("o")}, смысл + звук ${n("z")}, подсказка ${n("p")}; похожих групп ${groups.length}`);
