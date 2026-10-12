# Источники и лицензии

Всё, что «Прописи HSK» берут у других: данные, библиотеки, шрифты и модели. Диалоги, опорные фразы, переводы,
пояснения к правилам и сам код приложения — свои.

## Данные

| Что | Откуда | Лицензия | Где лежит |
|---|---|---|---|
| Черты иероглифов и порядок письма | [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) — данные проекта [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), извлечённые из шрифтов Arphic PL KaitiM GB и Arphic PL UKai (Arphic Technology) | [Arphic Public License](licenses/ARPHICPL.TXT) | `data/strokes-N.json` |
| Записи слогов (озвучка отдельного знака) | [davinfifield/mp3-chinese-pinyin-sound](https://github.com/davinfifield/mp3-chinese-pinyin-sound) | Unlicense (общественное достояние) | `data/audio-N.json` |
| Примеры предложений | [Tatoeba](https://tatoeba.org); у каждого примера в приложении есть ссылка на оригинал | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) | `data/sentences-N.json` |
| Словарь HSK: уровни слов, по которым отбираются примеры (о словаре внутри приложения — ниже) | [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary); сам он собран из списков HSK, CC-CEDICT, Make Me a Hanzi и других источников, перечисленных в его описании | MIT | только при сборке (`tools/`), в приложение не входит |
| Порядок уроков HSK 1 | оглавление учебника HSK Standard Course 1: какие знаки и какая грамматика в каком уроке | тексты учебника не используются | списки уроков в `index.html` |

Что изменено:

- записи слогов пережаты в mp3 32 кбит/с и выровнены по громкости (`tools/audio-gain.py`);
- к предложениям Tatoeba добавлен пиньинь (автоматически) и русский перевод там, где его не было; предложения
  с пометкой «составлено» написаны для тренажёра.

## Словарь внутри приложения

Знаки, их чтение, значения, слова-примеры, состав и группы по ключам лежат в `index.html` (`META`). Его собрал
Claude в чате скриптом `build.py`; самого скрипта в репозитории нет.

| Что | Откуда | Лицензия |
|---|---|---|
| Русские значения, HSK 1 | подобраны вручную по урокам | свои |
| Русские значения, HSK 2–6 (около 2 400 знаков) | написаны Claude; это не перевод CC-CEDICT, английские значения из complete-hsk-vocabulary не использовались. **Ещё не проверены** — аудит будет при переходе к HSK 2 | свои |
| Пиньинь знаков и слова-примеры, HSK 2–6 | [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), списки HSK 2.0; пиньинь там взят из [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | MIT; CC-CEDICT — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Состав знаков («Состав»), HSK 2–6 | собран автоматически из разбора в `dictionary.txt` проекта [Make Me a Hanzi](https://github.com/skishore/makemeahanzi); он получен из данных Unihan и CJKlib | в README лицензия не названа, он отсылает к файлу [COPYING](https://github.com/skishore/makemeahanzi/blob/master/COPYING); там: GNU Lesser General Public License версии 3 или новее |
| Состав знаков, HSK 1 | подобран вручную | свой |
| Группы по ключам, HSK 1 | составлены вручную | свои |
| Порядок частей, HSK 2–6 | по частотности из complete-hsk-vocabulary | MIT |

## Библиотеки

| Что | Откуда | Лицензия | Где лежит |
|---|---|---|---|
| Анимация и проверка черт | [Hanzi Writer](https://github.com/chanind/hanzi-writer) 3.5.0, David Chanin | MIT | `lib/hanzi-writer.min.js` |
| Пиньинь для текста | [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.4, zh-lx | MIT | `lib/pinyin-pro.min.js` |
| Распознавание записи на устройстве (строгая проверка) | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), сборка WebAssembly из [демонстрации k2-fsa](https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-zipformer-ctc); внутри — ONNX Runtime (MIT) | Apache 2.0 | `lib/sherpa/`; файл `.wasm` скачивается с Hugging Face |

## Шрифты

| Что | Откуда | Лицензия | Где лежит |
|---|---|---|---|
| Golos Text | Paratype, через Google Fonts | SIL Open Font License 1.1 | `fonts/golos-*.woff2` |
| Noto Serif SC | Google и Adobe, через Google Fonts (только знаки, нужные приложению) | SIL Open Font License 1.1 | `fonts/noto-serif-sc-*.woff2` |

## Модели

| Что | Откуда | Лицензия | Где лежит |
|---|---|---|---|
| Озвучка диалогов, фраз, слов и примеров HSK 1 | [Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) (hexgrad), голос `zf_017`; сгенерировано `tools/voice.py` | Apache 2.0 | `data/voice-1.json`, `data/voice-1-УУ.mp3` |
| Распознавание китайской речи (строгая проверка) | [sherpa-onnx-zipformer-ctc-small-zh-int8-2025-07-16](https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ctc-small-zh-int8-2025-07-16), проект sherpa-onnx / icefall (k2-fsa) | отдельная лицензия у модели не указана | в репозитории нет: скачивается с Hugging Face на устройство пользователя |

## Только на тестовой странице `/asr-test/`

Не входят в приложение, загружаются по требованию:

- [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 — Apache 2.0;
- [Whisper tiny](https://huggingface.co/onnx-community/whisper-tiny) (OpenAI) — MIT;
- [Dolphin base CTC](https://huggingface.co/csukuangfj/sherpa-onnx-dolphin-base-ctc-multi-lang-int8-2025-04-02) (DataoceanAI) — Apache 2.0;
- [SenseVoice small](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17) (FunAudioLLM) — FunASR Model License.

## Только при сборке

- [seek-bzip](https://github.com/cscott/seek-bzip) — MIT (распаковка выгрузок Tatoeba);
- [kokoro](https://github.com/hexgrad/kokoro) и [misaki](https://github.com/hexgrad/misaki) — Apache 2.0 (запуск модели озвучки);
- FFmpeg через [imageio-ffmpeg](https://github.com/imageio/imageio-ffmpeg) — кодирование mp3.

## Что не подтверждено

- **Модель распознавания Zipformer CTC small zh**: её публикует проект sherpa-onnx, чей код под Apache 2.0, но у самой
  модели лицензия нигде не названа. Приложение её не распространяет — браузер скачивает её с Hugging Face.
