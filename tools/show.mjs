// Print the built sentences: `npm run show -- 好 学 会` or `npm run show -- --re "得了|长大" 20`
import fs from "node:fs";
import path from "node:path";
import { ROOT, charLv, lessonOf, lessonName } from "./common.mjs";

const args = process.argv.slice(2);
const data = {};
for (let l = 1; l <= 6; l++) {
  const f = path.join(ROOT, "data", `sentences-${l}.json`);
  if (fs.existsSync(f)) Object.assign(data, JSON.parse(fs.readFileSync(f, "utf8")));
}
const line = s => `  ${s.z}\n    ${s.p}\n    ${s.r}\n    ${s.o ? "составлено" : `Tatoeba #${s.t}${s.e ? ", перевод с английского" : ""}`}`;
if (args[0] === "--re") {
  const rx = new RegExp(args[1]), max = +(args[2] || 30), seen = new Set();
  const all = Object.values(data).flat().filter(s => rx.test(s.z) && !seen.has(s.z) && seen.add(s.z));
  all.slice(0, max).forEach(s => console.log(line(s)));
  console.log(`(${all.length} matching)`);
} else {
  for (const c of args) {
    const where = charLv[c] === 1 ? `HSK 1, ${lessonName(lessonOf[c])}` : `HSK ${charLv[c] ?? "?"}`;
    console.log(`${c} — ${where}`);
    (data[c] || []).forEach(s => console.log(line(s)));
  }
}
