// `npm run tones`: tones/hsk1.tsv + tones/pairs.txt → data/tones-1.json — the words of the tone table in «Речь» →
// «Тоны» (written and spoken pinyin) and the groups that differ only by tone.
// Spoken pinyin follows the rules: 3 + 3 → 2 + 3; 不 before the 4th tone → bú; 一 before the 4th → yí, before 1st,
// 2nd, 3rd → yì. Checks: two characters per word, only characters of HSK 1–2, at least 4 words in each of 20 cells.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TOOLS, charLv, lessonOf } from "./common.mjs";

const MARK = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };
const TONE_OF = s => { for (const ch of s.normalize("NFD")) if (MARK[ch]) return MARK[ch]; return 0; };
// a syllable with another tone mark: a/e first, then o in «ou», else the last vowel
function retone(s, t){
  const base = [...s.normalize("NFD")].filter(ch => !MARK[ch]).join("").normalize("NFC");
  if (!t) return base;
  const low = base.toLowerCase(), v = "aeiouü";
  let i = low.search(/[ae]/);
  if (i < 0) i = low.indexOf("ou");
  if (i < 0) for (let k = low.length - 1; k >= 0; k--) if (v.includes(low[k])) { i = k; break; }
  const mark = ["", "̄", "́", "̌", "̀"][t];
  return (base.slice(0, i + 1) + mark + base.slice(i + 1)).normalize("NFC");
}
// the tones as they are said: [first, second]
function said(z, t){
  const [a, b] = t;
  if (a === 3 && b === 3) return [2, 3];
  if (z[0] === "不" && b === 4) return [2, b];
  if (z[0] === "一") return [b === 4 ? 2 : 4, b];
  return [a, b];
}
const errors = [], words = [], isHan = ch => /\p{Script=Han}/u.test(ch);
const lessonFor = z => [...z].every(c => charLv[c] === 1) ? Math.max(...[...z].map(c => lessonOf[c])) : 0;
const lines = file => fs.readFileSync(path.join(TOOLS, "tones", file), "utf8").split(/\r?\n/);
lines("hsk1.tsv").forEach((line, i) => {
  if (!line.trim() || line.startsWith("#")) return;
  const at = `hsk1.tsv, строка ${i + 1}`;
  const [z, py = "", r = "", sp = ""] = line.split("\t").map(x => x.trim());
  const han = [...z].filter(isHan), syl = py.split(/\s+/).filter(Boolean);
  if (han.length !== 2 || syl.length !== 2) return errors.push(`${at}: ${z} — нужно два знака и два слога`);
  const odd = han.filter(c => !(charLv[c] <= 2));
  if (odd.length) errors.push(`${at}: ${z} — знаки не из HSK 1–2: ${odd.join("")}`);
  if (!r) errors.push(`${at}: ${z} — нет перевода`);
  if (words.some(w => w.z === z)) errors.push(`${at}: ${z} уже был`);
  const t = syl.map(TONE_OF);
  if (!t[0]) errors.push(`${at}: ${z} — у первого слога нет тона`);
  const k = sp ? sp.split(/\s+/).map(TONE_OF) : said(z, t);
  const s = sp || syl.map((x, j) => retone(x, k[j])).join(" ");
  words.push({ z, p: syl.join(" "), s, r, t, k, l: lessonFor(z) });
});
// 4 × 5 cells by the written tones
for (const a of [1, 2, 3, 4]) for (const b of [1, 2, 3, 4, 0]) {
  const n = words.filter(w => w.t[0] === a && w.t[1] === b).length;
  if (n < 4) errors.push(`клетка ${a} + ${b}: ${n} слов, нужно не меньше 4`);
}
// syllable → the first level whose data/audio-N.json has its recording
const audioKeys = [1, 2, 3, 4, 5, 6].map(l => { const f = path.join(ROOT, "data", `audio-${l}.json`); return fs.existsSync(f) ? new Set(Object.keys(JSON.parse(fs.readFileSync(f, "utf8")))) : new Set(); });
const AUDIO_LV = k => audioKeys.findIndex(s => s.has(k)) + 1;
const pairs = [];
let cur = [];
const flush = () => { if (cur.length) { if (cur.length < 2 || cur.length > 4) errors.push(`pairs.txt: в группе ${cur.map(x => x[0]).join(" ")} ${cur.length} строк(и), нужно 2–4`); pairs.push(cur); cur = []; } };
lines("pairs.txt").forEach((line, i) => {
  if (line.startsWith("#")) return;
  if (!line.trim()) return flush();
  const [z, py = "", r = ""] = line.split("\t").map(x => x.trim());
  if (!py || !r) errors.push(`pairs.txt, строка ${i + 1}: ${z} — нужны пиньинь и значение`);
  // a single syllable is played from the recordings of syllables (data/audio-N.json): the neural voice says a lone
  // syllable with a sentence melody, its tone is hard to hear. [z, pinyin, meaning, lesson, audio key, level id]
  const one = [...z].filter(isHan).length === 1;
  const key = one ? [...py.normalize("NFD")].filter(ch => !MARK[ch] && ch !== "̈").join("").toLowerCase().replace(/u(?=$)/, py.includes("ü") ? "uu" : "u") + TONE_OF(py) : "";
  const lvl = key ? AUDIO_LV(key) : 0;
  if (one && !lvl) errors.push(`pairs.txt, строка ${i + 1}: ${z} — нет записи слога ${key} в data/audio-*.json`);
  cur.push(one ? [z, py, r, lessonFor(z), key, lvl] : [z, py, r, lessonFor(z)]);
});
flush();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
const json = "{\"w\":[\n" + words.map(w => JSON.stringify(w)).join(",\n") + "\n],\n\"p\":[\n" + pairs.map(g => JSON.stringify(g)).join(",\n") + "\n]}\n";
fs.writeFileSync(path.join(ROOT, "data", "tones-1.json"), json);
const changed = words.filter(w => w.k.join() !== w.t.join());
console.log(`data/tones-1.json: слов ${words.length} (тон меняется: ${changed.map(w => `${w.z} ${w.s}`).join(", ")}); групп пар ${pairs.length}`);
