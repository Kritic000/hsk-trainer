// Step 1: download Tatoeba exports (Chinese, Russian, English + links) and the HSK word list into .cache/
// Re-run to refresh; existing files are overwritten. ~45 MB download, ~250 MB unpacked.
import fs from "node:fs";
import path from "node:path";
import Bunzip from "seek-bzip";
import { CACHE } from "./common.mjs";

const TATOEBA = "https://downloads.tatoeba.org/exports/per_language";
const files = [
  `${TATOEBA}/cmn/cmn_sentences.tsv.bz2`,
  `${TATOEBA}/rus/rus_sentences.tsv.bz2`,
  `${TATOEBA}/eng/eng_sentences.tsv.bz2`,
  `${TATOEBA}/cmn/cmn-rus_links.tsv.bz2`,
  `${TATOEBA}/cmn/cmn-eng_links.tsv.bz2`,
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json",
];
fs.mkdirSync(CACHE, { recursive: true });
for (const url of files) {
  const name = path.basename(url) === "complete.json" ? "hsk-complete.json" : path.basename(url, ".bz2");
  process.stdout.write(`${name} … `);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  let buf = Buffer.from(await r.arrayBuffer());
  if (url.endsWith(".bz2")) buf = Bunzip.decode(buf);
  fs.writeFileSync(path.join(CACHE, name), buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}
console.log("next: npm run select");
