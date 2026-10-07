// Step 3: Tatoeba picks + our translations + composed sentences → data/sentences-N.json (with pinyin)
// Also writes to-do lists to .cache/todo/: translate-*.tsv (picks without Russian) and
// compose-*.tsv (characters with fewer than 2 sentences).
import fs from "node:fs";
import path from "node:path";
import { makePinyin } from "./pinyin.mjs";
import { ROOT, PICKS, TRANSLATIONS, COMPOSED, TODO, META, charLv, lessonOf, lessonChars, lessonName, isHan, normZh, readTsv, checker, loadHsk } from "./common.mjs";

const { lex, chars } = JSON.parse(fs.readFileSync(PICKS, "utf8"));
const hsk = loadHsk();
const check = checker(lex);

const tr = Object.fromEntries(readTsv(TRANSLATIONS).map(([id, r]) => [id, r]));
// "!好" in composed/ pins the sentence first (to show a meaning Tatoeba lacks); at most 3 per character
const co = {}, pinned = {};
for (const [c0, z, r] of readTsv(COMPOSED)) { const c = c0.replace(/^!/, ""); ((c0.startsWith("!") ? pinned : co)[c] ||= []).push({ z: normZh(z), r }); }

const toPinyin = makePinyin(hsk, lex);
// HSK 1 lessons 1–2 have only ~20 characters: better no example than an artificial one
const minSentences = c => charLv[c] === 1 && lessonOf[c] <= 2 ? 0 : 2;
const tidyRu = r => r.replace(/ - /g, " — ").replace(/\s+/g, " ").trim();

// ---- merge
const problems = [], files = {}, missing = [], rejected = new Set();
const counts = { chars: 0, tatoebaRu: 0, translated: 0, composed: 0, dropped: 0, short: 0 };
for (const c in chars) {
  const lv = chars[c].lv, list = [];
  for (const p of chars[c].picks) {
    if (tr[p.id] === "SKIP" || check(c, p.z)) { counts.dropped++; continue; }
    // our translation in translations/ wins over Tatoeba's Russian (used to fix bad ones)
    const r = tr[p.id] || p.rus;
    if (!r) { missing.push(p); continue; }
    const z = /[。？！…”」]$/.test(p.z) ? p.z : p.z + "。";
    list.push({ z, p: toPinyin(z), r: tidyRu(r), t: p.id, ...(p.rus ? {} : { e: 1 }) });
    counts[p.rus ? "tatoebaRu" : "translated"]++;
  }
  const pins = pinned[c] || [];
  if (pins.length) list.splice(Math.max(0, 3 - pins.length));
  let pinAt = 0;
  for (const s of [...pins, ...(co[c] || [])]) {
    if (list.length >= 3) break;
    const bad = check(c, s.z) || (list.some(x => x.z === s.z) ? "duplicate" : null);
    if (bad) { problems.push(`${c} (${lv === 1 ? lessonName(lessonOf[c]) : "HSK " + lv}): ${s.z} — ${bad}`); if (bad !== "duplicate") rejected.add(`${c}\t${s.z}`); continue; }
    const item = { z: s.z, p: toPinyin(s.z), r: tidyRu(s.r), o: 1 };
    if (pins.includes(s)) list.splice(pinAt++, 0, item); else list.push(item);
    counts.composed++;
  }
  if (list.length < minSentences(c)) counts.short++;
  if (list.length) { (files[lv] ||= {})[c] = list; counts.chars++; }
}
for (const lv in files) fs.writeFileSync(path.join(ROOT, "data", `sentences-${lv}.json`), JSON.stringify(files[lv]));

// ---- to-do lists
fs.rmSync(TODO, { recursive: true, force: true }); fs.mkdirSync(TODO, { recursive: true });
const chunk = (rows, name) => { for (let i = 0; i < rows.length; i += 200) fs.writeFileSync(path.join(TODO, `${name}-${String(i / 200).padStart(2, "0")}.tsv`), rows.slice(i, i + 200).join("\n") + "\n"); };
const seen = new Set();
chunk(missing.filter(p => !seen.has(p.id) && seen.add(p.id)).map(p => `${p.id}\t${p.z}\t${p.eng || ""}`), "translate");
const compose = [];
for (const c in chars) {
  const lv = chars[c].lv, have = files[lv]?.[c] || [], n = minSentences(c) - have.length; if (n <= 0) continue;
  const it = META.items[c];
  const hint = lv === 1 ? `${lessonName(lessonOf[c])}; можно: ${[...lessonChars[lessonOf[c]]].join("")}`
    : Object.keys(lex).filter(w => w.includes(c) && lex[w] <= lv).sort((a, b) => lex[a] - lex[b] || a.length - b.length).slice(0, 8).join(" ");
  compose.push(`${c}\tHSK ${lv}\tнужно ${n}\t${it.p}\t${it.m}\t${hint}\t${have.map(s => s.z).join(" ")}`);
}
chunk(compose, "compose");

// --prune: delete rejected lines from composed/*.tsv (comments and accepted lines stay)
if (process.argv.includes("--prune") && rejected.size) {
  for (const f of fs.readdirSync(COMPOSED).filter(f => f.endsWith(".tsv"))) {
    const file = path.join(COMPOSED, f), lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const keep = lines.filter(l => { const [c0, z] = l.split("\t"); return !(z && rejected.has(`${c0.replace(/^!/, "").trim()}\t${normZh(z)}`)); });
    if (keep.length !== lines.length) fs.writeFileSync(file, keep.join("\n"));
  }
  console.log(`pruned ${rejected.size} rejected composed lines`);
}
console.log(JSON.stringify(counts));
console.log(`to do: ${seen.size} to translate, ${compose.length} characters need sentences (see ${path.relative(ROOT, TODO)})`);
if (problems.length) console.log(`rejected composed sentences (${problems.length}):\n` + problems.join("\n"));
