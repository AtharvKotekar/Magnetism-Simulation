// Live canvas recorder. This captures the simulation exactly as the user drives
// it: press record, interact with the board/current/taps, press stop, download.

export class Recorder {
  constructor(app) {
    this.app = app;
    this.media = null;
    this.chunks = [];
    this.stream = null;
    this.copyRaf = 0;
    this.timer = 0;
    this.startedAt = 0;
    this.captureCanvas = null;
    this.captureCtx = null;
    this.failed = false;
  }

  get active() {
    return this.media && this.media.state !== 'inactive';
  }

  start(cfg = {}, onStatus = () => {}, onDone = () => {}, onError = () => {}) {
    if (this.active) return false;
    if (!this.app.canvas.captureStream || typeof MediaRecorder === 'undefined') {
      throw new Error('Live recording needs a browser with canvas MediaRecorder support.');
    }

    const fps = Math.max(1, cfg.fps || 30);
    const source = this.app.canvas;
    const scale = Math.max(0.25, Math.min(1, cfg.scale || 1));
    const W = even(cfg.size?.width || source.width * scale);
    const H = even(cfg.size?.height || source.height * scale);
    const target = this.captureTarget(source, W, H);
    const mimeChoices = chooseMimes(cfg.format);

    this.chunks = [];
    this.failed = false;
    this.stream = target.captureStream(fps);
    const baseOptions = { videoBitsPerSecond: cfg.bitrate || 28e6 };
    let chosenMime = '';
    let lastError = null;
    for (const mime of mimeChoices) {
      try {
        const options = { ...baseOptions, ...(mime ? { mimeType: mime } : {}) };
        this.media = new MediaRecorder(this.stream, options);
        chosenMime = mime;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!this.media) {
      this.stopCopyLoop();
      this.stopTracks();
      throw lastError || new Error('No supported live recording format.');
    }
    this.startedAt = performance.now();

    this.media.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.media.onerror = (e) => {
      const err = e.error || new Error('Recording failed.');
      this.failed = true;
      this.cleanup();
      this.media = null;
      this.chunks = [];
      onError(err);
    };
    this.media.onstop = () => {
      if (this.failed) return;
      const elapsed = (performance.now() - this.startedAt) / 1000;
      clearInterval(this.timer);
      const mime = this.media?.mimeType || chosenMime || 'video/webm';
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(this.chunks, { type: mime });
      if (blob.size > 0) download(blob, `manual_${W}x${H}_${fps}fps_${this.app.takeHash}_${stamp()}.${ext}`);
      this.cleanup();
      this.media = null;
      this.chunks = [];
      onStatus(`saved ${elapsed.toFixed(1)} s`);
      onDone({ elapsed, bytes: blob.size, ext });
    };

    try {
      this.media.start(1000);
    } catch (err) {
      this.stopCopyLoop();
      this.stopTracks();
      this.media = null;
      throw err;
    }
    this.timer = setInterval(() => {
      const elapsed = (performance.now() - this.startedAt) / 1000;
      onStatus(`recording ${elapsed.toFixed(1)} s`);
    }, 200);
    onStatus('recording 0.0 s');
    return true;
  }

  stop() {
    if (this.active) this.media.stop();
  }

  cancel() {
    this.stop();
  }

  captureTarget(source, W, H) {
    if (W === source.width && H === source.height) return source;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.captureCanvas = c;
    this.captureCtx = c.getContext('2d', { alpha: false });
    this.captureCtx.imageSmoothingEnabled = true;
    this.captureCtx.imageSmoothingQuality = 'high';
    const copy = () => {
      this.captureCtx.drawImage(source, 0, 0, W, H);
      this.copyRaf = requestAnimationFrame(copy);
    };
    copy();
    return c;
  }

  stopCopyLoop() {
    if (this.copyRaf) cancelAnimationFrame(this.copyRaf);
    this.copyRaf = 0;
    this.captureCanvas = null;
    this.captureCtx = null;
  }

  stopTracks() {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }

  cleanup() {
    clearInterval(this.timer);
    this.timer = 0;
    this.stopCopyLoop();
    this.stopTracks();
  }
}

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function chooseMimes(format = 'webm') {
  const prefs = format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const supported = prefs.filter((mime) => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(mime));
  return supported.length ? supported : [''];
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}
