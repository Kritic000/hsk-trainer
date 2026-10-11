"""Выравнивает громкость записей слогов в data/audio-N.json.

Громкость меняется без перекодирования: в каждом кадре mp3 сдвигается поле global_gain
(шаг 1,5 дБ, как в mp3gain), поэтому качество и размер файлов не меняются.
Уровень — среднеквадратичный по звучащей части слога; цель TARGET дБ, пик не выше PEAK дБ.
Повторный запуск ничего не меняет. Нужны numpy и imageio-ffmpeg (ffmpeg только измеряет).

    python tools/audio-gain.py          # показать, что изменится
    python tools/audio-gain.py --write  # записать data/audio-*.json
"""
import base64, json, subprocess, sys
from pathlib import Path
import numpy as np, imageio_ffmpeg

TARGET, PEAK, STEP = -20.0, -1.0, 20 * np.log10(2 ** 0.25)
FF = imageio_ffmpeg.get_ffmpeg_exe()
DATA = Path(__file__).resolve().parent.parent / "data"
BITRATES = {1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]}
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def decode(mp3):
    out = subprocess.run([FF, "-v", "quiet", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", "22050", "pipe:1"], input=mp3, capture_output=True).stdout
    return np.frombuffer(out, dtype=np.float32)


def level(a):
    """(RMS of the voiced part, peak) in dB: 20 ms frames within 30 dB of the loudest one."""
    n = 441
    f = a[: len(a) // n * n].reshape(-1, n)
    e = np.sqrt((f ** 2).mean(1) + 1e-12)
    act = e[e > e.max() * 10 ** (-30 / 20)]
    return 20 * np.log10(np.sqrt((act ** 2).mean())), 20 * np.log10(np.abs(a).max() + 1e-9)


def shift_gain(mp3, steps):
    """Adds `steps` to global_gain of every granule of every Layer III frame."""
    b = bytearray(mp3)
    i = 0
    if b[:3] == b"ID3":
        i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127))
    frames = 0
    while i + 4 <= len(b):
        h = int.from_bytes(b[i:i + 4], "big")
        ver, layer, br, sr = h >> 19 & 3, h >> 17 & 3, h >> 12 & 15, h >> 10 & 3
        if h >> 21 != 0x7FF or ver == 1 or layer != 1 or br in (0, 15) or sr == 3:
            i += 1
            continue
        v1, mono = ver == 3, (h >> 6 & 3) == 3
        size = (144 if v1 else 72) * BITRATES[v1][br] * 1000 // RATES[ver][sr] + (h >> 9 & 1)
        side = i + 4 + (0 if h >> 16 & 1 else 2)
        side_len = (17 if mono else 32) if v1 else (9 if mono else 17)
        if b[side + side_len:side + side_len + 4] not in (b"Xing", b"Info"):
            nch = 1 if mono else 2
            bit = (18 if mono else 20) if v1 else (9 if mono else 10)
            for _ in range((2 if v1 else 1) * nch):
                pos = side * 8 + bit + 21  # after part2_3_length (12) and big_values (9)
                byte, off = pos // 8, pos % 8
                w = int.from_bytes(b[byte:byte + 2], "big")
                g = w >> (8 - off) & 255
                if g:  # 0 — an empty granule
                    g2 = min(255, max(1, g + steps))
                    w = w & ~(255 << (8 - off)) | g2 << (8 - off)
                    b[byte:byte + 2] = w.to_bytes(2, "big")
                bit += 59 if v1 else 63
            frames += 1
        i += size
    return bytes(b), frames


def main():
    write = "--write" in sys.argv
    done, before, after, changed = {}, [], [], 0
    for path in sorted(DATA.glob("audio-*.json")):
        raw = path.read_text(encoding="utf-8")
        d = json.loads(raw)
        assert json.dumps(d, ensure_ascii=False, separators=(",", ":")) == raw.strip(), f"{path.name}: unexpected formatting"
        for k, v in d.items():
            if v not in done:
                mp3 = base64.b64decode(v)
                rms, peak = level(decode(mp3))
                steps = int(round(min(TARGET - rms, PEAK - peak) / STEP))
                new = v
                if steps:
                    out, frames = shift_gain(mp3, steps)
                    assert frames and len(out) == len(mp3), k
                    new = base64.b64encode(out).decode()
                    r2, p2 = level(decode(out))
                    assert abs(r2 - (rms + steps * STEP)) < 1.0 and p2 < 0, (k, rms, r2, p2, steps)
                    after.append(r2)
                else:
                    after.append(rms)
                before.append(rms)
                done[v] = new
            changed += done[v] != v
            d[k] = done[v]
        if write:
            path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + raw[len(raw.rstrip()):], encoding="utf-8", newline="")
        print(path.name, len(d), flush=True)
    pct = lambda x: np.percentile(x, [0, 5, 50, 95, 100]).round(1)
    print(f"записей: {len(done)}, изменено: {sum(a != b for a, b in done.items())}; ссылок изменено: {changed}")
    print("уровень до, дБ (мин/5%/медиана/95%/макс):", pct(before))
    print("уровень после:", pct(after))
    print("записано" if write else "проверка без записи: добавь --write")


if __name__ == "__main__":
    main()
