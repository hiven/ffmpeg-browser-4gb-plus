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

const ffmpegLogs = [];

const toBlobURLPatched = async (url, mimeType, patcher) => {
  const resp = await fetch(url);
  let body = await resp.text();
  if (patcher) body = patcher(body);
  return URL.createObjectURL(new Blob([body], { type: mimeType }));
};

const toBlobURL = async (url, mimeType, cb) => {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
  const total = CORE_SIZE[url];
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      cb && cb({ url, total, received, delta: 0, done });
      break;
    }
    chunks.push(value);
    received += value.length;
    cb && cb({ url, total, received, delta: value.length, done: false });
  }
  const data = new Uint8Array(received);
  let position = 0;
  for (const chunk of chunks) {
    data.set(chunk, position);
    position += chunk.length;
  }
  return URL.createObjectURL(new Blob([data.buffer], { type: mimeType }));
};

function log(message) {
  console.log(message);
}

const load = async (threadMode, cb) => {
  tryMultiThread = threadMode;
  const ffmpegBlobURL = await toBlobURLPatched(
    `${baseURLFFMPEG}/ffmpeg.js`,
    'text/javascript',
    js => js.replace('new URL(e.p+e.u(814),e.b)', 'r.workerLoadURL')
  );
  await import(ffmpegBlobURL);
  ffmpeg = new FFmpegWASM.FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    ffmpegLogs.push(message);
    log(message);
  });

  if (tryMultiThread && window.crossOriginIsolated) {
    console.log("multi-threaded");
    await ffmpeg.load({
      workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript', cb),
      coreURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.js`, 'text/javascript', cb),
      wasmURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.wasm`, 'application/wasm', cb),
      workerURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.worker.js`, 'application/javascript', cb),
    });
  } else {
    console.log("single-threaded");
    await ffmpeg.load({
      workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript', cb),
      coreURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.js`, 'text/javascript', cb),
      wasmURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.wasm`, 'application/wasm', cb),
    });
  }
  console.log('ffmpeg load success');
};

function downloadFileByBlob(blobUrl, filename) {
  const eleLink = document.createElement('a');
  eleLink.download = filename;
  eleLink.style.display = 'none';
  eleLink.href = blobUrl;
  document.body.appendChild(eleLink);
  eleLink.click();
  document.body.removeChild(eleLink);
}
