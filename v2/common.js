var ffmpeg = null;
var tryMultiThread = false;

const CORE_VERSION = "0.12.6";
const FFMPEG_VERSION = "0.12.10";
const baseURLFFMPEG = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd`;
const baseURLCore = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const baseURLCoreMT = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/umd`;

const CORE_SIZE = {
  [`${baseURLCore}/ffmpeg-core.js`]: 114673,
  [`${baseURLCore}/ffmpeg-core.wasm`]: 32129114,
  [`${baseURLCoreMT}/ffmpeg-core.js`]: 132680,
  [`${baseURLCoreMT}/ffmpeg-core.wasm`]: 32609891,
  [`${baseURLCoreMT}/ffmpeg-core.worker.js`]: 2915,
  [`${baseURLFFMPEG}/814.ffmpeg.js`]: 2648,
};

const toBlobURLPatched = async (url, mimeType, patcher) => {
  const resp = await fetch(url);
  let body = await resp.text();
  if (patcher) body = patcher(body);
  const blob = new Blob([body], { type: mimeType });
  return URL.createObjectURL(blob);
};

const toBlobURL = async (url, mimeType, cb) => {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);

  const total = CORE_SIZE[url] || -1;
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    const delta = value ? value.length : 0;
    if (done) break;
    chunks.push(value);
    received += delta;
    cb && cb({ url, total, received, delta, done });
  }

  const data = new Uint8Array(received);
  let position = 0;
  for (const chunk of chunks) {
    data.set(chunk, position);
    position += chunk.length;
  }

  const blob = new Blob([data.buffer], { type: mimeType });
  return URL.createObjectURL(blob);
};

function log(message) {
  const tty = document.getElementById("tty");
  if (tty) {
    tty.innerHTML += "</br>" + message;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } else {
    console.log("[TTY Missing]", message);
  }
}

function cleanLog() {
  const tty = document.getElementById("tty");
  if (tty) tty.innerHTML = "";
}

const load = async (threadMode, cb) => {
  tryMultiThread = threadMode;

  const ffmpegBlobURL = await toBlobURLPatched(
    `${baseURLFFMPEG}/ffmpeg.js`,
    'text/javascript',
    js => js.replace('new URL(e.p+e.u(814),e.b)', 'r.workerLoadURL') // patch the worker URL
  );

  await import(ffmpegBlobURL);

  ffmpeg = new FFmpegWASM.FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    log(message);
  });

  if (tryMultiThread && window.crossOriginIsolated) {
    console.log("Using multi-threaded core");
    await ffmpeg.load({
      workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript', cb),
      coreURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.js`, 'text/javascript', cb),
      wasmURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.wasm`, 'application/wasm', cb),
      workerURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.worker.js`, 'application/javascript', cb),
    });
  } else {
    console.log("Using single-threaded core");
    await ffmpeg.load({
      workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript', cb),
      coreURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.js`, 'text/javascript', cb),
      wasmURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.wasm`, 'application/wasm', cb),
    });
  }

  console.log('✅ FFmpeg loaded');
};

function downloadFileByBlob(blobUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.style.display = 'none';
  link.href = blobUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
