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

// Words and grammar the Standard Course 1 has not introduced by the lesson (99 = not in book 1 at all).
// A safety net for the mistakes already made once — extend it when a new one is found.
const TOO_EARLY = [
  [/没有/u, 10, "没有 — с урока 10"],
  [/(\p{Script=Han})[不没]\1/u, 99, "вопрос вида A不A — грамматика второй книги"],
  [/一起|这么|去年|回来|怎么了|说话/u, 99, "слово не из первой книги"],
  [/看看|听听|说说|想想|坐坐|问问|读读|写写/u, 99, "удвоение глагола — грамматика второй книги"],
  [/(什么|哪儿|谁)都/u, 99, "«вопросительное слово + 都» — грамматика второй книги"],
  [/[做写买看吃喝说读给学]的\p{Script=Han}/u, 99, "«глагол + 的 + существительное» — грамматика второй книги"],
  [/了[一二三四五六七八九十几]+(年|天|个月|个星期|分钟|次)/u, 99, "длительность после 了 — грамматика второй книги"],
  [/(美美|国生)(老师|先生)/u, 99, "к 老师 и 先生 добавляют фамилию, не имя"],
];
const tooEarly = (z, n) => TOO_EARLY.filter(([re, from]) => n < from && re.test(z)).map(x => x[2]);
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
