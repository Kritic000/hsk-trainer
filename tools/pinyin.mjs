// Pinyin for sentences and example words, written the way the HSK Standard Course writes it:
// syllables of a word together (zàijiàn, xuésheng), neutral tones from the HSK dictionary,
// 一/不 tone changes, proper nouns capitalized, Chinese punctuation → Latin.
import { pinyin } from "pinyin-pro";
import { isHan } from "./common.mjs";

// Rule tables — extend these when you find a wrong spelling.
// Words added for grouping (missing from the HSK dictionary)
const EXTRA_WORDS = ["这个", "那个", "哪个", "一下", "长官", "点钟", "茶杯", "小猫", "小狗",
  ...["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"].map(m => m + "月"), "影院", "电影院", "美国", "日本", "英国", "法国", "德国", "上海",
  ...["一", "二", "三", "四", "五", "六", "日", "天", "几"].map(d => "星期" + d)];
// Always written as separate words (verb + object, 不 + adjective, A-not-A, the textbook's spelling)
const NO_GROUP = new Set(["不客气", "没关系", "不太", "不对", "不大", "打电话", "回家", "下雨", "在家", "开车", "有人",
  "上个月", "下个月", "再也", "家里", "一一", "请坐", "不见", "不下", "不起", "不到", "不完", "不懂", "不动", "不住"]);
// One word only at the start of a clause: 再说，… "besides" vs 不会再说了 "won't say again"
const CLAUSE_START_ONLY = new Set(["再说"]);
// Not one word in these surroundings (prev char, next char)
const CONTEXT = {
  "再见": (p, n) => n === "面",                      // 再 见面
  "十分": (p, n) => n === "钟" || /[一二三四五六七八九]/.test(p), // 十 分钟, 二十 分
  "好多": (p, n) => n === "了",                      // 好 多 了 "much better"
  "个人": (p, n) => /[一二三四五六七八九十几这那哪每两]/.test(p), // 一 个 人
};
// Proper nouns not capitalized in the dictionary / capitalized there but common nouns
const PROPER_EXTRA = new Set(["美国", "日本", "英国", "法国", "德国", "上海"]);
const NOT_PROPER = new Set(["美元", "星期日", "华裔", "华侨", "华人", "西方"]);
// Neutral tone in the dictionary that is wrong here
const NEUTRAL_KEEP = new Set(["大人"]);
// Neutral tone missing in the dictionary
const NEUTRAL_EXTRA = [["这个", "zhè ge"], ["那个", "nà ge"], ["哪个", "nǎ ge"], ["这里", "zhè li"], ["那里", "nà li"], ["哪里", "nǎ li"], ["一下", "yí xià"]];
// Verbs whose reduplication takes a neutral second syllable: 看看 kànkan
const REDUP = new Set([..."看听试想坐说问走读写学等谈洗玩尝找聊歇"]);
const NO_ERHUA = new Set(["女儿", "儿子", "儿童", "婴儿", "幼儿", "孤儿", "健儿", "儿"]);
const PM = { "，": ",", "。": ".", "？": "?", "！": "!", "、": ",", "：": ":", "；": ";", "…": "…", "—": "—", "·": "·", "（": "(", "）": ")", "《": "«", "》": "»", "「": "\"", "」": "\"", "“": "\"", "”": "\"", "‘": "'", "’": "'" };
const NUMBER = /[一二三四五六七八九]?十[一二三四五六七八九]?/g;

// pinyin-pro falls back to the dictionary reading for single-character words outside a known compound
// (疼得 → dé, 轻轻地 → dì, 只可能 → zhī); fix those by looking at the neighbouring words
const PRON = /^(我|你|您|他|她|它|我们|你们|他们|她们|咱们|大家|也|还|就|都|必须|总|又|可|真)$/;
const NUM = /^([一二两三四五六七八九十百千几半每这那哪]|这个|那个)$/;
const COMPLEMENT = /^(见|下|起|到|完|懂|动|住)$/;
const ADVERB = /^(也|还|都|就|很|太|再|又|才|终于|已经|可能|一定|并|从来|根本|千万|一直|总是|真|最|更)$/;
// p/n/p2/n2: neighbouring words ignoring punctuation; ap/an: the tokens right next to it (for A不A)
function polyphone(w, p = "", n = "", p2 = "", ap = "", an = "", n2 = ""){
  switch (w) {
    case "得": return n === "了" || p === "不" || n === "不" ? "dé" : PRON.test(p) && isHan(n[0] || "") && !/^(很|太|多|好|快|慢|不)$/.test(n) ? "děi" : "de";
    case "地": return /^(了|在|满|种|扫|一|的|个|块|片|到|从|上|下|这|那)$/.test(p) || /^(上|下|里|面|方)$/.test(n) ? "dì" : "de";
    case "只": return NUM.test(p) || /[一二两三四五六七八九十几]$/.test(p) ? "zhī" : "zhǐ";
    case "长": return /^(伸|拉|延|变|加|放|很|太|真|多|最|更|比|那么|这么)$/.test(p) ? "cháng" : /^(了|大|出|着|得|高|胖)$/.test(n) ? "zhǎng" : "cháng";
    case "为": return /^(称|视|成|作|颇|较|极|甚|最|尤|有|认|以|变|改)$/.test(p) || /(称|视|成|作|颇|较|极|甚|尤|以)$/.test(p) || /^(称|视|认|作|选|当|叫)$/.test(p2) ? "wéi" : "wèi";
    case "还": return /^(钱|债|清)$/.test(n) ? "huán" : null;
    case "了": return p === "不" ? "liǎo" : "le";
    case "着": return /^(急|火|凉|迷)$/.test(n) ? "zháo" : "zhe";
    case "个": return "ge";
    case "谁": return "shéi";
    case "里": return "li";
    case "不": return (ap && ap === an && isHan(ap[0]))
      || (COMPLEMENT.test(n) && p && isHan(p[0]) && !PRON.test(p) && !ADVERB.test(p) && !(n === "下" && /^(雨|雪|班|课|午|去|来|次|个)/.test(n2))) ? "bu" : null;
    case "没": return p && n && n.startsWith("有") && p === "有" ? "méi" : null;
  }
  return null;
}

export function makePinyin(hsk, lex){
  const GROUP = new Set([...hsk.map(w => w.simplified), ...Object.keys(lex), ...EXTRA_WORDS]);
  const proper = new Set([...PROPER_EXTRA, ...hsk.filter(w => [...w.simplified].length > 1 && (w.forms || []).length && w.forms.every(f => /^[A-ZĀÁǍÀĒÉĚÈŌÓǑÒ]/.test(f.transcriptions?.pinyin || ""))).map(w => w.simplified)]);
  const DICT = {};
  for (const w of hsk) for (const f of w.forms || []) {
    const syl = (f.transcriptions?.pinyin || "").trim().split(/\s+/);
    if (syl.length === [...w.simplified].length && syl.length > 1) (DICT[w.simplified] ||= []).push(syl);
  }
  for (const [z, p] of NEUTRAL_EXTRA) (DICT[z] ||= []).push(p.split(" "));

  const stripTone = s => s.normalize("NFD").replace(/[̀-̄̌]/g, "").normalize("NFC");
  const bare = s => stripTone(s).replace(/ü/g, "u").toLowerCase();
  // neutral tones from the dictionary; we only remove a tone, never add one, so 一/不 changes stay intact
  function neutral(word, parts){
    if (NEUTRAL_KEEP.has(word)) return parts;
    const forms = (DICT[word] || []).filter(f => f.length === parts.length && f.every((s, i) => bare(s) === bare(parts[i])));
    return parts.map((s, i) => forms.some(f => f[i] === stripTone(f[i])) ? stripTone(s) : s);
  }
  const isRedup = w => [...w].length === 2 && w[0] === w[1] && REDUP.has(w[0]);
  const isANotA = w => /^(\p{Script=Han}+)[不没]\1/u.test(w) || /^(\p{Script=Han})没\1/u.test(w);

  // fewest words; among equal splits the longer word on the left (可以|来, 草地|上)
  function groupSeg(s){
    const a = [...s], n = a.length, best = Array(n + 1).fill(Infinity), len = Array(n + 1).fill(1);
    const numbers = new Set(); for (const m of s.matchAll(NUMBER)) if ([...m[0]].length > 1) numbers.add(m[0]);
    best[n] = 0;
    for (let i = n - 1; i >= 0; i--) for (let k = Math.min(8, n - i); k >= 1; k--) {
      const w = a.slice(i, i + k).join(""), p = a[i - 1] || "", nx = a[i + k] || "";
      if (k > 1) {
        if (![...w].every(isHan)) continue;
        if (!GROUP.has(w) && !numbers.has(w) && !isRedup(w)) continue;
        if (NO_GROUP.has(w) || isANotA(w)) continue;
        if (CLAUSE_START_ONLY.has(w) && i > 0 && isHan(p)) continue;
        if (CONTEXT[w] && CONTEXT[w](p, nx)) continue;
      }
      if (1 + best[i + k] < best[i]) { best[i] = 1 + best[i + k]; len[i] = k; }
    }
    const out = []; for (let i = 0; i < n; i += len[i]) out.push(a.slice(i, i + len[i]).join(""));
    return out;
  }

  // sentence: capitalized, punctuation converted; word: as is (only proper nouns capitalized)
  return function toPinyin(z, { sentence = true } = {}){
    const seg = groupSeg(z), words = seg.filter(w => isHan([...w][0]));
    const syl = pinyin(z, { type: "all" }).filter(x => x.isZh).map(x => x.pinyin);
    let k = 0, wi = -1, out = "", openQ = true;
    for (const [si, w] of seg.entries()) {
      if (!isHan([...w][0])) {
        const p = PM[w] ?? w;
        if (p === "\"") { out += openQ ? " \"" : "\""; openQ = !openQ; }
        else if (p === "«" || p === "(") out += " " + p;
        else out += p;
        continue;
      }
      wi++;
      const n = [...w].length;
      const fix = n === 1 ? polyphone(w, words[wi - 1], words[wi + 1], words[wi - 2], seg[si - 1], seg[si + 1], words[wi + 2]) : null;
      if (fix) syl[k] = fix;
      let parts = syl.slice(k, k + n); k += n;
      if (n > 1) parts = isRedup(w) ? [parts[0], stripTone(parts[1])] : neutral(w, parts);
      if (w.endsWith("儿") && n > 1 && !NO_ERHUA.has(w)) { parts.pop(); parts[parts.length - 1] += "r"; }
      let word = parts.map((s, i) => (i > 0 && /^[aeoāáǎàēéěèōóǒò]/.test(s) ? "'" : "") + s).join("");
      if (proper.has(w) && !NOT_PROPER.has(w)) word = word[0].toUpperCase() + word.slice(1);
      out += (out && !/[ "«(]$/.test(out) ? " " : "") + word;
    }
    out = out.trim().replace(/\s+([,.?!:;…»)])/g, "$1");
    if (!sentence) return out;
    out = out.replace(/(^"?|[.?!]"?\s+"?)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
    return out[0].toUpperCase() + out.slice(1);
  };
}
