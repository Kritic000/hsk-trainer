// `npm run speech`: speech/hskN.txt → data/speech-N.json (our own dialogues and key phrases per lesson, with pinyin).
// Checks: only characters of lessons 1…N (HSK 1), nothing copied from the textbook (sentences/exclude.txt),
// 2–3 dialogues and 5–10 phrase patterns per lesson. `--show 3 5 6` prints the built lessons.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TOOLS, PICKS, PUNCT, META, lessonChars, lessonName, isHan, hanOnly, normZh, loadExclude, loadHsk } from "./common.mjs";
import { makePinyin } from "./pinyin.mjs";

const toPinyin = makePinyin(loadHsk(), JSON.parse(fs.readFileSync(PICKS, "utf8")).lex);
// Names used in the dialogues: written as one capitalized word, not syllable by syllable
const NAMES = { "美美": "Měimei", "国生": "Guóshēng", "关老师": "Guān lǎoshī", "谢老师": "Xiè lǎoshī", "谢先生": "Xiè xiānsheng" };
// 谢谢老师 is "thank you, teacher", not the name 谢老师
const NAME_RE = new RegExp(`(${Object.keys(NAMES).sort((a, b) => b.length - a.length).map(n => n[0] === "谢" ? "(?<!谢)" + n : n).join("|")})`);
function pinyinOf(z, sentence = true){
  let out = z.split(NAME_RE).filter(Boolean).map(part => NAMES[part] || toPinyin(part, { sentence: false })).join(" ");
  out = out.replace(/\s+([,.?!:;…»)])/g, "$1").replace(/([«(])\s+/g, "$1").replace(/\s+/g, " ").replace(/"([^" ][^"]*)"(?=\p{L})/gu, '"$1" ').trim();
  if (!sentence) return out;
  out = out.replace(/(^"?|[.?!]"?\s+"?)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
  return out[0].toUpperCase() + out.slice(1);
}

// When a word or a grammar point becomes available in HSK Standard Course 1: [test, lesson, what it is].
// The lesson numbers follow the grammar notes in the textbook's table of contents (given by the user);
// 99 = not in book 1. Characters are checked separately (lessonChars), so a point whose key character
// is new in its own lesson (吗, 想, 能, 和, 太, 吧, 都…) needs no rule here.
// Not confirmed by the contents list, kept from the first review: 这么, 去年, 怎么了, 说话.
const HAN = String.raw`\p{Script=Han}`, NUM = "[一二三四五六七八九十几两]", ACT = "(做|看|学(?!校)|写|读|吃|喝|说|睡|打|买|听|工作|学习)";
const re = s => new RegExp(s, "u");
const clauses = z => z.split(/[，。？！、：；]/u);
const TOO_EARLY = [
  // words
  [re("没有"), 10, "слово 没有 — с урока 10"],
  [re("回来|一点儿"), 14, "слова 回来 и 一点儿 — с урока 14"],
  [re("一起"), 15, "слово 一起 — с урока 15"],
  [re("这么|去年|怎么了|说话"), 99, "слова нет в первой книге"],
  // grammar by lesson
  [re(`${NUM}个`), 8, "счётное слово 个 — с урока 8"],
  [re("请(?!问)"), 10, "请 + глагол — с урока 10"],
  [re("(上|下面|里|前面|后面|这儿|那儿)(没)?有"), 10, "有 как «находится, имеется где-то» — с урока 10"],
  [re("前(?!面)"), 11, "前 как «до, перед (о времени)» — с урока 11"],
  [re("会(下雨|冷|热)"), 12, "会 как «вероятно будет» — с урока 12"],
  [re(`在${ACT}`), 13, "在 + глагол (действие в процессе) — с урока 13; 在 + место + глагол можно с урока 9"],
  [re("后(?!面)"), 14, "后 как «после» — с урока 14"],
  // 了 after an action verb is a completed action, unless the clause is negated (不去了 — a change) or it is 太…了
  [z => clauses(z).some(c => re(`(去|来|买|吃|喝|看|做|写|读|说|打|回|听)(了|${HAN}{1,4}了吗?$)`).test(c) && !/不|太/u.test(c)), 14, "了 — завершённое действие — с урока 14"],
  [z => clauses(z).some(c => re("是.*(来|去|买|做|写|认识)的$").test(c) || re(`^${HAN}*(来|去|买|做|写|认识)的吗?$`).test(c)), 15, "是…的 — с урока 15"],
  [re("[一二三四五六七八九零〇]{4}年|哪年"), 15, "год в датах — с урока 15"],
  // not in book 1 at all
  [re(String.raw`(${HAN})[不没]\1`), 99, "вопрос вида A不A — в первой книге нет"],
  [re("看看|听听|说说|想想|坐坐|问问|读读|写写"), 99, "удвоение глагола — в первой книге нет"],
  [re("(什么|哪儿|谁)都"), 99, "«вопросительное слово + 都» — в первой книге нет"],
  [z => clauses(z).some(c => re(`[做写买看吃喝说读给学]的${HAN}`).test(c) && !/是/u.test(c)), 99, "«глагол + 的 + существительное» — в первой книге нет"],
  [re(`了${NUM}+(年|天|个月|个星期|分钟|次)`), 99, "длительность после 了 — в первой книге нет"],
  // names
  [re("(美美|国生)(老师|先生)"), 99, "к 老师 и 先生 добавляют фамилию, не имя"],
];
const tooEarly = (z, n) => TOO_EARLY.filter(([test, from]) => n < from && (typeof test === "function" ? test(z) : test.test(z))).map(x => x[2]);
// ---- vocabulary by lesson. sentences/vocab.txt is local (not in git, like exclude.txt): "lesson: words",
// parts of a word in brackets, proper names after "|". Without the file this check is skipped.
const VOCAB_FILE = path.join(TOOLS, "sentences", "vocab.txt");
function loadVocab(){
  if (!fs.existsSync(VOCAB_FILE)) return null;
  const from = {};
  for (const line of fs.readFileSync(VOCAB_FILE, "utf8").split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").match(/^\s*(\d+)\s*:(.+)$/); if (!m) continue;
    for (const w of m[2].split(/[\s()|,，、*]+/).filter(w => w && [...w].every(isHan))) from[w] = Math.min(from[w] ?? 99, +m[1]);
  }
  return from;
}
const vocab = loadVocab();
// Our own additions: a word made only of words already passed and obvious from them (word → lesson),
// plus things the vocabulary column does not list at all (numerals are checked by characters).
const OBVIOUS = {
  "我们": 3, "他们": 4, "她们": 4, // like 你们 of lesson 1
  "这个": 6,                       // lesson 6's own text has 这个字怎么写, though 这 and 个 are listed in lesson 8
};
const DIGITS = new Set("一二三四五六七八九十零");
// parts of a sentence that cannot be read as words of lessons 1…n
function unknownWords(z, n){
  const ok = w => (vocab[w] ?? 99) <= n || (OBVIOUS[w] ?? 99) <= n || w in NAMES || (w.length === 1 && DIGITS.has(w));
  const out = [];
  for (const run of z.split(/[^\p{Script=Han}]+/u).filter(Boolean)) {
    const a = [...run], L = a.length, cost = Array(L + 1).fill(Infinity), back = Array(L + 1), bad = Array(L + 1).fill(false);
    cost[0] = 0;
    for (let i = 0; i < L; i++) {
      if (cost[i] === Infinity) continue;
      for (let k = Math.min(5, L - i); k >= 1; k--) {
        const known = ok(a.slice(i, i + k).join(""));
        if (!known && k > 1) continue;
        const c = cost[i] + (known ? 0 : 1);
        if (c < cost[i + k]) { cost[i + k] = c; back[i + k] = i; bad[i + k] = !known; }
      }
    }
    let span = "";
    const spans = [];
    for (let j = L; j > 0; j = back[j]) { if (bad[j]) span = a[j - 1] + span; else if (span) { spans.unshift(span); span = ""; } }
    if (span) spans.unshift(span);
    out.push(...spans);
  }
  return out;
}
const vocabMiss = {};
const exclude = loadExclude();
const errors = [], notes = [];
// a formula of up to 3 characters (你好, 谢谢你, 不客气) cannot be avoided in any dialogue
const copied = z => { const h = hanOnly(z); return exclude.has(h) && [...h].length > 3; };

function build(level){
  const file = path.join(TOOLS, "speech", `hsk${level}.txt`);
  if (!fs.existsSync(file)) return null;
  const lessons = [];
  let cur = null, block = null, n = 0;
  const allowed = () => level === 1 ? lessonChars[n] : null;
  const text = (raw, where, sentence = true) => {
    const [z0, r] = raw.split("|").map(x => x.trim()), z = normZh(z0 || "");
    if (!z || !r) { errors.push(`${where}: нужны китайский текст и перевод через «|»: ${raw}`); return null; }
    if (![...z].every(ch => isHan(ch) || PUNCT.includes(ch))) errors.push(`${where}: не китайские символы: ${z}`);
    const ok = allowed(), late = ok ? [...new Set([...z].filter(ch => isHan(ch) && !ok.has(ch)))] : [];
    if (late.length) errors.push(`${where}: ${z} — знаки ${late.join("")} ещё не пройдены`);
    if (level === 1) for (const why of tooEarly(z, n)) errors.push(`${where}: ${z} — ${why}`);
    if (level === 1 && vocab) for (const w of unknownWords(z, n)) {
      errors.push(`${where}: ${z} — «${w}» нет среди слов уроков 1…${n}`);
      (vocabMiss[w] ||= []).push(`${n}: ${z}`);
    }
    return [z, pinyinOf(z, sentence), r];
  };
  for (const [i, line0] of fs.readFileSync(file, "utf8").split(/\r?\n/).entries()) {
    const line = line0.trim(); if (!line || line.startsWith("#")) continue;
    let m;
    if ((m = line.match(/^=\s*(\d+)$/))) { n = +m[1]; cur = lessons[n - 1] = { d: [], f: [] }; block = null; continue; }
    const where = `HSK ${level}, урок ${n}, строка ${i + 1}`;
    if (!cur) { errors.push(`${where}: сначала «= номер урока»`); continue; }
    if ((m = line.match(/^==\s*Д:\s*(.+)$/))) { block = { t: m[1], l: [] }; cur.d.push(block); continue; }
    if ((m = line.match(/^==\s*Ф:\s*(.+)$/))) { block = { t: m[1], a: [] }; cur.f.push(block); continue; }
    if (!block || !(m = line.match(/^([A-Z]):\s*(.+)$/))) { errors.push(`${where}: не понял строку: ${line}`); continue; }
    const [, key, rest] = m;
    if (block.l) { const t = text(rest, where); if (t) block.l.push([key, ...t]); continue; }
    if (key === "R") { block.r = rest; continue; }
    const t = text(rest, where, key !== "S"); if (!t) continue;
    if (key === "Q") block.q = t; else if (key === "A") block.a.push(t); else if (key === "S") (block.s ||= []).push(t);
    else errors.push(`${where}: в схеме бывают только Q, A, R, S`);
  }
  lessons.forEach((L, i) => {
    const name = level === 1 ? lessonName(i + 1) : `HSK ${level}, часть ${i + 1}`;
    if (!L) { errors.push(`${name}: урок пропущен`); return; }
    if (L.d.length < 2 || L.d.length > 3) errors.push(`${name}: диалогов ${L.d.length}, нужно 2–3`);
    if (L.f.length < 5 || L.f.length > 10) errors.push(`${name}: схем ${L.f.length}, нужно 5–10`);
    for (const d of L.d) {
      const roles = new Set(d.l.map(x => x[0]));
      if (d.l.length < 3 || roles.size !== 2) errors.push(`${name}, «${d.t}»: нужен диалог из 3+ реплик на две роли`);
      // two textbook lines in a row = a copied exchange
      d.l.forEach((x, k) => { if (k && copied(x[1]) && copied(d.l[k - 1][1])) errors.push(`${name}, «${d.t}»: две реплики учебника подряд — ${d.l[k - 1][1]} ${x[1]}`); });
      const same = d.l.filter(x => copied(x[1])).map(x => x[1]);
      if (same.length) notes.push(`${name}, диалог «${d.t}»: ${same.join(" ")}`);
    }
    for (const f of L.f) {
      if (!f.q || f.a.length < 2 || f.a.length > 3) errors.push(`${name}, «${f.t}»: нужен вопрос и 2–3 ответа`);
      if (f.s && (!f.r || ![f.q, ...f.a].some(x => x && x[0].includes(f.r)))) errors.push(`${name}, «${f.t}»: R должно быть частью вопроса или ответа`);
      const same = [f.q, ...f.a].filter(x => x && copied(x[0])).map(x => x[0]);
      if (same.length) notes.push(`${name}, схема «${f.t}»: ${same.join(" ")}`);
    }
  });
  return lessons;
}

const show = process.argv.includes("--show") ? process.argv.slice(process.argv.indexOf("--show") + 1).map(Number) : null;
const built = {};
for (const L of META.levels) { const b = build(L.id); if (b) built[L.id] = b; }
// `--vocab`: only the words missing from the lesson vocabulary, most frequent first
if (process.argv.includes("--vocab")) {
  for (const w of Object.keys(vocabMiss).sort((x, y) => vocabMiss[y].length - vocabMiss[x].length))
    console.log(`${w}\t${vocabMiss[w].length}×\tуроки ${[...new Set(vocabMiss[w].map(x => x.split(":")[0]))].join(",")}\t${vocabMiss[w][0]}`);
  process.exit(0);
}
if (errors.length) { console.log(errors.join("\n")); console.log(`\nошибок: ${errors.length} — файлы не записаны`); process.exit(1); }
for (const id in built) {
  fs.writeFileSync(path.join(ROOT, "data", `speech-${id}.json`), JSON.stringify(built[id]));
  const d = built[id].reduce((s, L) => s + L.d.length, 0), f = built[id].reduce((s, L) => s + L.f.length, 0);
  console.log(`data/speech-${id}.json: уроков ${built[id].length}, диалогов ${d}, схем ${f}`);
}
if (!exclude.size) console.log("нет sentences/exclude.txt — сверка с учебником не выполнялась");
else if (notes.length && !show) console.log(`\nотдельные фразы, совпавшие с exclude.txt (ключевые формулы урока, не диалоги целиком): ${notes.length}\n  ` + notes.join("\n  "));
if (show) for (const n of show) {
  const L = built[1][n - 1]; if (!L) continue;
  console.log(`\n===== ${lessonName(n)} =====`);
  for (const d of L.d) { console.log(`\nДиалог «${d.t}»`); for (const [r, z, p, t] of d.l) console.log(`  ${r}: ${z}\n     ${p}\n     ${t}`); }
  for (const f of L.f) {
    console.log(`\nФраза «${f.t}»\n  ? ${f.q.join("  |  ")}`);
    for (const a of f.a) console.log(`  → ${a.join("  |  ")}`);
    if (f.s) console.log(`  вместо ${f.r}: ${f.s.map(s => `${s[0]} ${s[1]} (${s[2]})`).join("; ")}`);
  }
}
