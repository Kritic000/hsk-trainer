// Shared paths and rules for the sentence tools.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOLS, "..");
export const CACHE = path.join(TOOLS, ".cache");            // downloads + todo lists (not in git)
export const SENT = path.join(TOOLS, "sentences");          // our hand-made data (in git)
export const PICKS = path.join(SENT, "picks.json");         // Tatoeba picks per character
export const TRANSLATIONS = path.join(SENT, "translations"); // id \t russian | id \t SKIP
export const COMPOSED = path.join(SENT, "composed");         // char \t chinese \t russian ("!char" = pin first)
export const EXCLUDE = path.join(SENT, "exclude.txt");       // Chinese sentences never to use (one per line)
export const TODO = path.join(CACHE, "todo");

export const PUNCT = "，。？！、：；“”‘’《》…—·「」（）";
export const isHan = ch => /\p{Script=Han}/u.test(ch);
export const hanOnly = z => [...z].filter(isHan).join("");
export const normZh = z => z.trim().replace(/\?/g, "？").replace(/!/g, "！").replace(/,/g, "，");

export function readTsv(dir){
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".tsv")).sort()
    .flatMap(f => fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#")).map(l => l.split("\t").map(x => x.trim())));
}

// Sentences excluded by text (compared by characters only, punctuation ignored)
export function loadExclude(){
  if (!fs.existsSync(EXCLUDE)) return new Set();
  return new Set(fs.readFileSync(EXCLUDE, "utf8").split(/\r?\n/).map(l => l.replace(/#.*/, "")).map(hanOnly).filter(Boolean));
}

// ---- the app's own data: levels, lessons, items
export const META = JSON.parse(fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/const META = (\{.*\});\r?\n/)[1]);

// char -> level (1-based, first level it appears in, same as the app's LOC)
export const charLv = {};
META.levels.forEach((L, li) => Object.values(L.modes)[0].forEach(g => g.items.forEach(c => { if (!charLv[c]) charLv[c] = li + 1; })));

// HSK 1 follows the HSK Standard Course 1 lessons: char -> lesson number, and the characters
// available after each lesson (lesson N may use lessons 1…N). The last group ("Ещё в HSK 1")
// counts as the lesson after the textbook ones.
export const lessonOf = {};
export const lessonChars = [new Set()];
META.levels[0].modes.lessons.forEach((g, i) => {
  const set = new Set(lessonChars[i]);
  g.items.forEach(c => { set.add(c); if (!lessonOf[c]) lessonOf[c] = i + 1; });
  lessonChars.push(set);
});
export const lessonName = n => META.levels[0].modes.lessons[n - 1].name;

// ---- vocabulary for HSK 2–6: word -> lowest allowed level
//  - HSK 2.0 ("old-N") level, or
//  - HSK 3.0 ("new-N"/"newest-N") level, but only if every character of the word is already taught by
//    the app at that level (the 2.0 list lacks basics like 天, 一些, 春天, 早饭)
//  - the app's example words count at their character's level, unless they are just phrases of HSK
//    words (去学校, 我想), which would only distort segmentation
export function buildLex(hsk){
  const lex = {};
  for (const w of hsk) {
    const z = w.simplified, lvOf = re => w.level.map(x => x.match(re)).filter(Boolean).map(m => +m[1]);
    const old = lvOf(/^old-(\d)$/), neu = lvOf(/^new(?:est)?-(\d)$/).filter(n => n <= 6);
    const gate = Math.max(...[...z].map(ch => charLv[ch] ?? 9));
    const cand = [...old, ...neu.map(n => Math.max(n, gate))].filter(n => n <= 6);
    if (cand.length) lex[z] = Math.min(lex[z] ?? 9, ...cand);
  }
  const seg = segmenter(lex), extra = {};
  for (const c in META.items) {
    const w = META.items[c].w; if (!w || !charLv[c] || lex[w] <= charLv[c]) continue;
    const s = seg(w); if (!s || s.lv > charLv[c]) extra[w] = Math.min(extra[w] ?? 9, charLv[c]);
  }
  return Object.assign(lex, extra);
}

// min over segmentations of the max word level; returns {lv, seg} or null
export function segmenter(lex){
  const MAXW = Math.max(...Object.keys(lex).map(w => [...w].length));
  return s => {
    const a = [...s], n = a.length, dp = Array(n + 1).fill(Infinity), back = Array(n + 1);
    dp[0] = 0;
    for (let i = 0; i < n; i++) {
      if (dp[i] === Infinity) continue;
      if (PUNCT.includes(a[i])) { if (dp[i] < dp[i + 1]) { dp[i + 1] = dp[i]; back[i + 1] = i; } continue; }
      for (let k = MAXW; k >= 1; k--) {
        if (i + k > n) continue;
        const l = lex[a.slice(i, i + k).join("")];
        if (l == null) continue;
        const v = Math.max(dp[i], l);
        if (v < dp[i + k]) { dp[i + k] = v; back[i + k] = i; }
      }
    }
    if (dp[n] === Infinity) return null;
    const seg = []; for (let j = n; j > 0; j = back[j]) seg.unshift(a.slice(back[j], j).join(""));
    return { lv: dp[n], seg };
  };
}

// ---- the rule every example sentence must pass. Returns null if fine, otherwise the reason.
//  HSK 1: only characters from lessons 1…N of the character's lesson.
//  HSK 2–6: every word from HSK of the character's level or lower (see buildLex).
export function checker(lex){
  const seg = segmenter(lex), exclude = loadExclude();
  return (c, z) => {
    const han = [...z].filter(isHan);
    if (!z.includes(c)) return "no char";
    if (han.length > 12) return `${han.length} han`;
    if (![...z].every(ch => isHan(ch) || PUNCT.includes(ch))) return "non-Chinese symbols";
    if (exclude.has(han.join(""))) return "in exclude.txt";
    const lv = charLv[c];
    if (lv === 1) {
      const n = lessonOf[c], ok = lessonChars[n], out = [...new Set(han.filter(ch => !ok.has(ch)))];
      return out.length ? `HSK 1 lesson ${n}: ${out.join("")} not yet taught` : null;
    }
    const s = seg(z);
    if (!s) return "not segmentable by HSK words";
    if (s.lv > lv) return `level ${s.lv} > ${lv} [${s.seg.join(" ")}]`;
    return null;
  };
}

export const loadHsk = () => JSON.parse(fs.readFileSync(path.join(CACHE, "hsk-complete.json"), "utf8"));
