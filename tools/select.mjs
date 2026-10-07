// Step 2: pick up to 3 Tatoeba sentences for every character → sentences/picks.json
// Earlier picks are kept when still valid (their translations are already done),
// sentences marked SKIP in translations/ or listed in exclude.txt are never picked.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { CACHE, PICKS, TRANSLATIONS, charLv, isHan, hanOnly, normZh, readTsv, buildLex, segmenter, checker, loadHsk } from "./common.mjs";

const lex = buildLex(loadHsk());
const seg = segmenter(lex), check = checker(lex);

const prev = new Set(), skip = new Set();
if (fs.existsSync(PICKS)) for (const r of Object.values(JSON.parse(fs.readFileSync(PICKS, "utf8")).chars)) r.picks.forEach(p => prev.add(p.id));
for (const [id, r] of readTsv(TRANSLATIONS)) if (r === "SKIP") skip.add(+id);

async function lines(file, fn){ const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity }); for await (const l of rl) fn(l); }

// Chinese sentences: 3–12 characters, Chinese punctuation only, made of HSK words or HSK 1 characters
const cmn = {};
await lines(path.join(CACHE, "cmn_sentences.tsv"), l => {
  const [id, , z0] = l.split("\t"); if (!z0 || skip.has(+id)) return;
  const z = normZh(z0);
  const han = hanOnly(z).length;
  if (han < 3 || han > 12 || /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ\s.]/.test(z)) return;
  const s = seg(z), hsk1 = [...hanOnly(z)].every(ch => charLv[ch] === 1);
  if (!s && !hsk1) return;
  cmn[id] = { id: +id, z, han, seg: s ? s.seg : [...z] };
});
const links = { rus: {}, eng: {} };
for (const lang of ["rus", "eng"]) await lines(path.join(CACHE, `cmn-${lang}_links.tsv`), l => { const [a, b] = l.split("\t"); if (cmn[a]) (links[lang][a] ||= []).push(b); });
const need = { rus: new Set(Object.values(links.rus).flat()), eng: new Set(Object.values(links.eng).flat()) };
const text = { rus: {}, eng: {} };
for (const lang of ["rus", "eng"]) await lines(path.join(CACHE, `${lang}_sentences.tsv`), l => { const i = l.indexOf("\t"), id = l.slice(0, i); if (need[lang].has(id)) text[lang][id] = l.slice(l.indexOf("\t", i + 1) + 1).trim(); });
for (const id in cmn) {
  const pick = lang => (links[lang][id] || []).map(t => text[lang][t]).filter(Boolean).sort((a, b) => a.length - b.length)[0] || null;
  cmn[id].rus = pick("rus"); cmn[id].eng = pick("eng");
}
const pool = Object.values(cmn).filter(s => s.rus || s.eng);
const byChar = {};
for (const s of pool) for (const ch of new Set(s.z)) if (charLv[ch]) (byChar[ch] ||= []).push(s);

function lev(a, b){
  a = [...a]; b = [...b];
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(p[j] + 1, cur[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = cur;
  }
  return p[b.length];
}

// Preference: earlier pick > has Russian > not overused > ~7 characters > different words with the char;
// near-duplicates (1–2 characters apart) are dropped.
const used = {}, res = {};
const stat = { chars: 0, zero: 0, one: 0, two: 0, three: 0, rus: 0, eng: 0 };
for (const c of Object.keys(charLv)) {
  const cand = (byChar[c] || []).filter(s => !check(c, s.z));
  const wordOf = s => s.seg.find(w => w.includes(c));
  const picks = [];
  const score = s => (s.rus ? 0 : 1000) + (prev.has(s.id) ? -1500 : 0) + (used[s.id] || 0) * 50 + Math.abs(s.han - 7) * 3 + (s.han < 5 ? 40 : 0)
    + picks.filter(p => wordOf(p) === wordOf(s)).length * 15;
  let left = cand.slice();
  while (picks.length < 3 && left.length) {
    left.sort((a, b) => score(a) - score(b) || a.id - b.id);
    const s = left.shift();
    picks.push(s);
    left = left.filter(x => !picks.some(p => lev(hanOnly(p.z), hanOnly(x.z)) <= (Math.min(p.han, x.han) >= 8 ? 2 : 1)));
  }
  picks.forEach(s => { used[s.id] = (used[s.id] || 0) + 1; stat[s.rus ? "rus" : "eng"]++; });
  res[c] = { lv: charLv[c], picks: picks.map(({ id, z, rus, eng, seg }) => ({ id, z, rus, eng, seg })) };
  stat.chars++; stat[["zero", "one", "two", "three"][picks.length]]++;
}
fs.mkdirSync(path.dirname(PICKS), { recursive: true });
fs.writeFileSync(PICKS, JSON.stringify({ lex, chars: res }));
console.log(`pool ${pool.length} sentences; picks: ${JSON.stringify(stat)}`);
console.log("next: npm run build");
