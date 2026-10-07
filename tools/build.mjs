// Step 3: Tatoeba picks + our translations + composed sentences → data/sentences-N.json (with pinyin)
// Also writes to-do lists to .cache/todo/: translate-*.tsv (picks without Russian) and
// compose-*.tsv (characters with fewer than 2 sentences).
import fs from "node:fs";
import path from "node:path";
import { pinyin } from "pinyin-pro";
import { ROOT, PICKS, TRANSLATIONS, COMPOSED, TODO, META, charLv, lessonOf, lessonChars, lessonName, isHan, normZh, readTsv, checker, loadHsk } from "./common.mjs";

const { lex, chars } = JSON.parse(fs.readFileSync(PICKS, "utf8"));
const hsk = loadHsk();
const check = checker(lex);

const tr = Object.fromEntries(readTsv(TRANSLATIONS).map(([id, r]) => [id, r]));
// "!好" in composed/ pins the sentence first (to show a meaning Tatoeba lacks); at most 3 per character
const co = {}, pinned = {};
for (const [c0, z, r] of readTsv(COMPOSED)) { const c = c0.replace(/^!/, ""); ((c0.startsWith("!") ? pinned : co)[c] ||= []).push({ z: normZh(z), r }); }

// ---- pinyin
// words for grouping syllables only (all HSK levels incl. 7–9), not for level checks;
// fewest words, and among equal splits the longer word on the left (可以|来, 草地|上)
const GROUP = new Set([...hsk.map(w => w.simplified), ...Object.keys(lex), "这个", "那个", "哪个"]);
// words that are only one word at the start of a clause: 再说，… "besides" vs 不会再说了 "say again"
const CLAUSE_START_ONLY = new Set(["再说"]);
// written as two words in the textbook: bú kèqi, méi guānxi, bú tài
const NO_GROUP = new Set(["不客气", "没关系", "不太"]);
function groupSeg(s){
  const a = [...s], n = a.length, best = Array(n + 1).fill(Infinity), len = Array(n + 1).fill(1);
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) for (let k = Math.min(8, n - i); k >= 1; k--) {
    const w = a.slice(i, i + k).join("");
    if (k > 1 && (!GROUP.has(w) || ![...w].every(isHan))) continue;
    if (k > 1 && CLAUSE_START_ONLY.has(w) && i > 0 && isHan(a[i - 1])) continue;
    if (NO_GROUP.has(w)) continue;
    if (1 + best[i + k] < best[i]) { best[i] = 1 + best[i + k]; len[i] = k; }
  }
  const out = []; for (let i = 0; i < n; i += len[i]) out.push(a.slice(i, i + len[i]).join(""));
  return out;
}
// proper nouns to capitalize: multi-character words whose every dictionary form is capitalized
// (中国, 汉语, 长江); POS tags are unreliable (不太 is tagged as a name), 成功/大学 also have a place-name form
const NOT_PROPER = new Set(["美元", "星期日", "华裔", "华侨", "华人", "西方"]);
const proper = new Set(hsk.filter(w => [...w.simplified].length > 1 && (w.forms || []).length && w.forms.every(f => /^[A-ZĀÁǍÀĒÉĚÈŌÓǑÒ]/.test(f.transcriptions?.pinyin || ""))).map(w => w.simplified));
const PM = { "，": ",", "。": ".", "？": "?", "！": "!", "、": ",", "：": ":", "；": ";", "…": "…", "—": "—", "·": "·", "（": "(", "）": ")", "《": "«", "》": "»", "「": "\"", "」": "\"", "“": "\"", "”": "\"", "‘": "'", "’": "'" };
const NO_ERHUA = new Set(["女儿", "儿子", "儿童", "婴儿", "幼儿", "孤儿", "健儿", "儿"]);
// pinyin-pro falls back to the dictionary reading for single-character words outside a known compound
// (疼得 → dé, 轻轻地 → dì, 只可能 → zhī); fix those by looking at the neighbouring words
const PRON = /^(我|你|您|他|她|它|我们|你们|他们|她们|咱们|大家|也|还|就|都|必须|总|又|可|真)$/;
const NUM = /^([一二两三四五六七八九十百千几半每这那哪]|这个|那个)$/;
function polyphone(w, p = "", n = "", p2 = ""){
  switch (w) {
    case "得": return n === "了" || p === "不" ? "dé" : PRON.test(p) && isHan(n[0] || "") && !/^(很|太|多|好|快|慢|不)$/.test(n) ? "děi" : "de";
    case "地": return /^(了|在|满|种|扫|一|的|个|块|片|到|从|上|下|这|那)$/.test(p) || /^(上|下|里|面|方)$/.test(n) ? "dì" : "de";
    case "只": return NUM.test(p) || /[一二两三四五六七八九十几]$/.test(p) ? "zhī" : "zhǐ";
    case "长": return /^(伸|拉|延|变|加|放|很|太|真|多|最|更|比|那么|这么)$/.test(p) ? "cháng" : /^(了|大|出|着|得|高|胖)$/.test(n) ? "zhǎng" : "cháng";
    case "为": return /^(称|视|成|作|颇|较|极|甚|最|尤|有|认|以|变|改)$/.test(p) || /(称|视|成|作|颇|较|极|甚|尤|以)$/.test(p) || /^(称|视|认|作|选|当|叫)$/.test(p2) ? "wéi" : "wèi";
    case "还": return /^(钱|债|清)$/.test(n) ? "huán" : null;
    case "了": return p === "不" ? "liǎo" : "le";
    case "着": return /^(急|火|凉|迷)$/.test(n) ? "zháo" : "zhe";
  }
  return null;
}
function toPinyin(z){
  const seg = groupSeg(z), words = seg.filter(w => isHan([...w][0]));
  const syl = pinyin(z, { type: "all" }).filter(x => x.isZh).map(x => x.pinyin);
  let k = 0, wi = -1, out = "", openQ = true;
  for (const w of seg) {
    if (!isHan([...w][0])) {
      const p = PM[w] ?? w;
      if (p === "\"") { out += openQ ? " \"" : "\""; openQ = !openQ; }
      else if (p === "«" || p === "(") out += " " + p;
      else out += p;
      continue;
    }
    wi++;
    const n = [...w].length;
    const fix = n === 1 ? polyphone(w, words[wi - 1], words[wi + 1], words[wi - 2]) : null;
    if (fix) syl[k] = fix;
    const parts = n > 1 ? neutral(w, syl.slice(k, k + n)) : syl.slice(k, k + n); k += n;
    if (w.endsWith("儿") && n > 1 && !NO_ERHUA.has(w)) { parts.pop(); parts[parts.length - 1] += "r"; }
    let word = parts.map((s, i) => (i > 0 && /^[aeoāáǎàēéěèōóǒò]/.test(s) ? "'" : "") + s).join("");
    if (proper.has(w) && !NOT_PROPER.has(w)) word = word[0].toUpperCase() + word.slice(1);
    out += (out && !/[ "«(]$/.test(out) ? " " : "") + word;
  }
  out = out.trim().replace(/\s+([,.?!:;…»)])/g, "$1").replace(/(^"?|[.?!]"?\s+"?)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
  return out[0].toUpperCase() + out.slice(1);
}
// neutral tones as in the textbook (学生 xuésheng, 东西 dōngxi): the HSK dictionary writes them without
// a tone mark. We only ever remove a tone, never add one, so 一/不 sandhi from pinyin-pro stays intact.
const stripTone = s => s.normalize("NFD").replace(/[̀-̄̌]/g, "").normalize("NFC");
const bare = s => stripTone(s).replace(/ü/g, "u").toLowerCase();
const DICT = {};
for (const w of hsk) for (const f of w.forms || []) {
  const syl = (f.transcriptions?.pinyin || "").trim().split(/\s+/);
  if (syl.length === [...w.simplified].length && syl.length > 1) (DICT[w.simplified] ||= []).push(syl);
}
// missing from the dictionary
for (const [z, p] of [["这个", "zhè ge"], ["那个", "nà ge"], ["哪个", "nǎ ge"]]) (DICT[z] ||= []).push(p.split(" "));
function neutral(word, parts){
  const forms = (DICT[word] || []).filter(f => f.length === parts.length && f.every((s, i) => bare(s) === bare(parts[i])));
  return parts.map((s, i) => forms.some(f => f[i] === stripTone(f[i])) ? stripTone(s) : s);
}
const tidyRu = r => r.replace(/ - /g, " — ").replace(/\s+/g, " ").trim();

// ---- merge
const problems = [], files = {}, missing = [], rejected = new Set();
const counts = { chars: 0, tatoebaRu: 0, translated: 0, composed: 0, dropped: 0, short: 0 };
for (const c in chars) {
  const lv = chars[c].lv, list = [];
  for (const p of chars[c].picks) {
    if (tr[p.id] === "SKIP" || check(c, p.z)) { counts.dropped++; continue; }
    const r = p.rus || tr[p.id];
    if (!r) { missing.push(p); continue; }
    list.push({ z: p.z, p: toPinyin(p.z), r: tidyRu(r), t: p.id, ...(p.rus ? {} : { e: 1 }) });
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
  if (list.length < 2) counts.short++;
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
  const lv = chars[c].lv, have = files[lv]?.[c] || [], n = 2 - have.length; if (n <= 0) continue;
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
