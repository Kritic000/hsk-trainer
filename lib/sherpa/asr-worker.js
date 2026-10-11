// Worker of the strict check in «Речь»: recognises a recording on the device with sherpa-onnx (WebAssembly).
// load  { files: { wasm, model, tokens }, caches: [names to look in], store: name to keep downloads in }
//       → progress { got } … → ready | error { message }
// run   { id, pcm: Float32Array, rate } → result { id, text, ms } | result { id, error }
importScripts("sherpa-onnx-asr.js");

let recognizer = null;

// a file from the browser's caches, or from the network (then it is kept for the next time)
async function get(url, names, store, onProgress){
  for (const n of names) {
    try {
      if (!(await caches.has(n))) continue;
      const hit = await (await caches.open(n)).match(url);
      if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onProgress(b.length); return b; }
    } catch (e) {}
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("не скачалось (" + res.status + ")");
  let saved = Promise.resolve();
  try { const cache = await caches.open(store); saved = cache.put(url, res.clone()).catch(() => {}); } catch (e) {}
  const reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(got); }
  const buf = new Uint8Array(got);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  await saved;
  return buf;
}

async function load(m){
  let done = 0;
  const data = {};
  for (const k of ["wasm", "model", "tokens"]) {
    data[k] = await get(m.files[k], m.caches, m.store, g => postMessage({ type: "progress", got: done + g }));
    done += data[k].length;
  }
  await new Promise((ok, no) => {
    self.Module = {
      wasmBinary: data.wasm,
      // the demo build expects a 368 MB package with its own model: it is not downloaded, its files are created empty
      getPreloadedPackage: () => new ArrayBuffer(0),
      onRuntimeInitialized: ok, onAbort: e => no(new Error("wasm: " + e)), setStatus(){}, print(){}, printErr(){},
    };
    try { importScripts("sherpa-onnx-wasm-main-vad-asr.js"); } catch (e) { no(e); }
  });
  Module.FS_createDataFile("/", "asr.onnx", data.model, true, true, true);
  Module.FS_createDataFile("/", "asr-tokens.txt", data.tokens, true, true, true);
  recognizer = new OfflineRecognizer({ modelConfig: { zipformerCtc: { model: "/asr.onnx" }, tokens: "/asr-tokens.txt", numThreads: 1, provider: "cpu", debug: 0 } }, Module);
  if (!recognizer.handle) throw new Error("модель не создалась");
  recognize(new Float32Array(16000), 16000); // the first run is slow: do it now
}

function recognize(pcm, rate){
  const s = recognizer.createStream();
  s.acceptWaveform(rate, pcm);
  recognizer.decode(s);
  const text = recognizer.getResult(s).text || "";
  s.free();
  return text;
}

onmessage = async e => {
  const m = e.data;
  if (m.type === "load") {
    try { await load(m); postMessage({ type: "ready" }); }
    catch (err) { postMessage({ type: "error", message: String(err && err.message || err) }); }
  } else if (m.type === "run") {
    try { const t0 = performance.now(), text = recognize(m.pcm, m.rate); postMessage({ type: "result", id: m.id, text, ms: Math.round(performance.now() - t0) }); }
    catch (err) { postMessage({ type: "result", id: m.id, error: String(err && err.message || err) }); }
  }
};
