"""Нейросетевая озвучка фраз: диалоги, опорные фразы, слова, примеры предложений и слова «Тонов» уровня.

Модель Kokoro-82M-v1.1-zh (Apache 2.0, https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh), голос VOICE.
Пишет data/voice-N.json (указатель: текст → [урок, смещение, длина]) и data/voice-N-УУ.mp3
(mp3 всех фраз урока подряд). Сгенерированные wav лежат в tools/.cache/voice — повторный запуск
озвучивает только новые тексты.

    python tools/voice.py 1 --check   # сверить чтение модели с пиньинем из данных, ничего не озвучивая
    python tools/voice.py 1           # озвучить и собрать файлы уровня

Нужны: kokoro, misaki[zh], soundfile, numpy, imageio-ffmpeg (см. tools/README.md).
"""
import hashlib, json, re, subprocess, sys, unicodedata
from pathlib import Path

VOICE, SPEED, REPO, RATE = "zf_017", 0.9, "hexgrad/Kokoro-82M-v1.1-zh", 24000
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache" / "voice" / VOICE
FIXES = ROOT / "tools" / "voice-fixes.json"   # текст → как написать его для модели, если она читает неверно
HAN = re.compile(r"[㐀-鿿]")
han = lambda s: "".join(HAN.findall(s))


def load(level):
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    meta = json.loads(re.search(r"^const META = (\{.*\});?\s*$", html, re.M).group(1))
    lv = next(L for L in meta["levels"] if L["id"] == level)
    groups = lv["modes"][next(iter(lv["modes"]))]
    syl = set(re.search(r'const PY_SYL = new Set\("([^"]+)"', html).group(1).split())

    def read(name):
        p = ROOT / "data" / f"{name}-{level}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    return meta["items"], groups, read("speech") or [], read("sentences") or {}, syl


def collect(level):
    """[(lesson, text, pinyin)] — every text once, in the first lesson it appears in."""
    items, groups, speech, sents, syl = load(level)
    out, seen = [], set()

    def add(g, z, p):
        z = (z or "").strip()
        if z and han(z) and z not in seen:
            seen.add(z)
            out.append((g, z, p or ""))

    for g, grp in enumerate(groups):
        L = speech[g] if g < len(speech) else None
        if L:
            for d in L["d"]:
                for x in d["l"]:
                    add(g, x[1], x[2])
            for f in L["f"]:
                for x in [f["q"], *f["a"]]:
                    add(g, x[0], x[1])
        for c in grp["items"]:
            it = items[c]
            if it.get("ln"):
                add(g, it["ln"].split(" — ")[0], it.get("lnp"))
            add(g, it.get("w"), it.get("wp"))
            add(g, it.get("say"), None)
        for c in grp["items"]:
            for s in sents.get(c, []):
                add(g, s["z"], s.get("p"))
    # «Тоны»: the words of the table and the groups of «Пары» — in the file of their lesson, words of HSK 2 in the last one
    tones = ROOT / "data" / f"tones-{level}.json"
    if tones.exists():
        t = json.loads(tones.read_text(encoding="utf-8"))
        last = len(groups) - 1
        for w in t["w"]:
            add(w["l"] - 1 if w["l"] else last, w["z"], w["p"])
        for grp in t["p"]:
            for z, py, _, l, *rec in grp:
                if not rec:  # single syllables are played from the recordings of syllables
                    add(l - 1 if l else last, z, py)
    return out, syl


# ---- check of the model's reading against the pinyin of the data
MARK = {"̄": 1, "́": 2, "̌": 3, "̀": 4}


def tones_of(py, syl):
    """Tones of a pinyin string, syllable by syllable (0 — neutral); None when it does not split."""
    out = []
    for chunk in re.split(r"[^A-Za-zÀ-ɏ̀-ͯ]+", unicodedata.normalize("NFD", py)):
        base, tone = [], []
        for ch in chunk:
            if ch in MARK:
                if tone: tone[-1] = MARK[ch]
            elif unicodedata.combining(ch):
                pass
            else:
                base.append(ch.lower()); tone.append(0)
        s, n = "".join(base), len(base)
        best, cut = [0] + [None] * n, [0] * (n + 1)
        for i in range(n):
            if best[i] is None: continue
            for k in range(1, 7):
                if i + k > n: break
                w = s[i:i + k]
                ok = w in syl or (len(w) > 1 and w != "er" and w.endswith("r") and w[:-1] in syl)
                if ok and (best[i + k] is None or best[i] + 1 < best[i + k]):
                    best[i + k], cut[i + k] = best[i] + 1, i
        if n and best[n] is None: return None
        parts, j = [], n
        while j > 0:
            parts.insert(0, (cut[j], j)); j = cut[j]
        out += [max(tone[a:b]) for a, b in parts]
    return out


def check(texts, syl, g2p, fixes):
    bad = 0
    for g, z, p in texts:
        want = tones_of(p, syl) if p else None
        ph = "".join(r.phonemes or "" for r in g2p(fixes.get(z, z)))
        got = [int(d) % 5 for d in re.findall(r"[1-5]", ph)]
        if want is None: continue
        chars = han(z)
        if len(want) != len(got) or len(got) != len(chars):
            # erhua is one syllable in pinyin and may be one or two for the model
            if "儿" in chars and abs(len(want) - len(got)) <= chars.count("儿"): continue
            print(f"урок {g + 1}: {z} | {p} | слогов: данные {len(want)}, модель {len(got)} | {ph}"); bad += 1
            continue
        diff = []
        for i, (c, w, k) in enumerate(zip(chars, want, got)):
            if w == k: continue
            if w == 3 and k == 2 and i + 1 < len(want) and want[i + 1] in (3, 0): continue  # 3 + 3 → 2 + 3
            if c in "一不" and k in (1, 2, 4) and w in (1, 2, 4): continue                 # 一/不 change their tone
            diff.append(f"{c}: данные {w}, модель {k}")
        if diff:
            print(f"урок {g + 1}: {z} | {p} | {'; '.join(diff)}"); bad += 1
    print(f"текстов: {len(texts)}, расхождений: {bad}")


# ---- synthesis and packing
def main():
    level = int(next(a for a in sys.argv[1:] if a.isdigit()))
    texts, syl = collect(level)
    fixes = json.loads(FIXES.read_text(encoding="utf-8")) if FIXES.exists() else {}
    print(f"уровень {level}: текстов {len(texts)}, иероглифов {sum(len(han(z)) for _, z, _ in texts)}")
    from kokoro import KModel, KPipeline
    if "--check" in sys.argv:
        return check(texts, syl, KPipeline(lang_code="z", repo_id=REPO, model=False), fixes)

    import numpy as np, soundfile as sf, torch, imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    CACHE.mkdir(parents=True, exist_ok=True)
    pipe = None
    files, index = {}, {}
    for n, (g, z, _) in enumerate(texts):
        said = fixes.get(z, z)
        wav = CACHE / (hashlib.sha1(f"{SPEED}|{said}".encode()).hexdigest()[:16] + ".wav")
        if not wav.exists():
            if pipe is None:
                dev = "cuda" if torch.cuda.is_available() else "cpu"
                pipe = KPipeline(lang_code="z", repo_id=REPO, model=KModel(repo_id=REPO).to(dev).eval())
            a = np.concatenate([r.audio.cpu().numpy() for r in pipe(said, voice=VOICE, speed=SPEED)])
            sf.write(wav, a, RATE)
            if n % 100 == 0: print(f"  озвучено {n} из {len(texts)}", flush=True)
        a, _ = sf.read(wav, dtype="float32")
        # trim the silence around the phrase, bring every phrase to the same level
        loud = np.flatnonzero(np.abs(a) > np.abs(a).max() * 0.02)
        a = a[max(loud[0] - RATE * 60 // 1000, 0):loud[-1] + RATE * 120 // 1000]
        f = a[:len(a) // 480 * 480].reshape(-1, 480)
        e = np.sqrt((f ** 2).mean(1) + 1e-12)
        act = e[e > e.max() * 10 ** (-30 / 20)]
        a = a * min(10 ** (-20 / 20) / np.sqrt((act ** 2).mean()), 0.89 / np.abs(a).max())
        mp3 = subprocess.run([ff, "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "32k",
                              "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", "pipe:1"],
                             input=a.astype("float32").tobytes(), capture_output=True, check=True).stdout
        buf = files.setdefault(g, bytearray())
        index[z] = [g, len(buf), len(mp3)]
        buf += mp3
    data = ROOT / "data"
    for old in data.glob(f"voice-{level}-*.mp3"): old.unlink()
    for g, buf in sorted(files.items()):
        (data / f"voice-{level}-{g + 1:02d}.mp3").write_bytes(buf)
    (data / f"voice-{level}.json").write_text(json.dumps({"voice": VOICE, "model": REPO, "t": index}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="")
    total = sum(len(b) for b in files.values())
    print(f"файлов: {len(files)}, всего {total / 1e6:.1f} МБ; самый большой урок {max(len(b) for b in files.values()) / 1e6:.2f} МБ")


if __name__ == "__main__":
    main()
