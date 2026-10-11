# sherpa-onnx (WebAssembly) — строгая проверка по записи в «Речи»

- `sherpa-onnx-asr.js`, `sherpa-onnx-wasm-main-vad-asr.js` — без изменений из демонстрации
  [k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-zipformer-ctc](https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-zipformer-ctc)
  (коммит `9d5fc71d88ab1222ed1af2274fb194592af48455`), проект [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), лицензия Apache 2.0.
- `asr-worker.js` — наш воркер: скачивает движок и модель, держит их в кэше браузера, распознаёт запись.

Файл `.wasm` (11,7 МБ) и модель `sherpa-onnx-zipformer-ctc-small-zh-int8-2025-07-16` (63 МБ, проект sherpa-onnx/icefall;
отдельная лицензия у модели не указана) в репозиторий не кладём: воркер скачивает их с Hugging Face по адресам из
`ASR_FILES` в `index.html`, когда пользователь включает строгую проверку.
