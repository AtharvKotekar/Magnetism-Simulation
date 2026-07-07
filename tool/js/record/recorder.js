// Deterministic, frame-stepped recorder. Never consults the wall clock:
// the take restarts from t=0 with the configured seed, the worker advances
// EXACTLY frameDt per frame in fixed substeps, and every frame is rendered
// and encoded before the next one is simulated. Slower than realtime at full
// quality — that's the point.

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from '../../vendor/mp4-muxer.mjs';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from '../../vendor/webm-muxer.mjs';
import { ZipStore } from './zipstore.js';

export class Recorder {
  constructor(app) {
    this.app = app;
    this.cancelled = false;
  }

  // cfg: {format, fps, duration, scale, substeps, renderStyle,
  //       renderStride, shadows, includeIndicator}
  async record(cfg, onProgress) {
    const app = this.app;
    this.cancelled = false;
    const totalFrames = Math.max(1, Math.round(cfg.duration * cfg.fps));
    const frameDt = 1 / cfg.fps;
    const W = Math.round(app.canvas.width * cfg.scale / 2) * 2;
    const H = Math.round(app.canvas.height * cfg.scale / 2) * 2;

    // output sinks
    let video = null;
    let pngSink = null;
    const isVideo = cfg.format === 'mp4' || cfg.format === 'webm';
    if (isVideo) video = await this.setupVideo(cfg, W, H);
    else pngSink = await this.setupPngSink(cfg);

    // scaled capture surface (drawImage from the gl canvas)
    let capCanvas = null, capCtx = null;
    if (cfg.scale !== 1 || isVideo) {
      capCanvas = new OffscreenCanvas(W, H);
      capCtx = capCanvas.getContext('2d');
    }

    // deterministic restart
    await app.resetTake();

    const meta = {
      takeHash: app.takeHash,
      seed: app.params.seed,
      fps: cfg.fps,
      duration: cfg.duration,
      frames: totalFrames,
      resolution: [W, H],
      substepsPerFrame: cfg.substeps,
      renderStyle: cfg.renderStyle,
      renderStride: cfg.renderStride,
      shadows: cfg.shadows,
      params: { ...app.params },
      calibration: app.cal,
      timeline: app.timeline,
      recordedAt: new Date().toISOString(),
    };

    try {
      for (let f = 0; f < totalFrames; f++) {
        if (this.cancelled) break;
        // simulate exactly one frame of time
        const snap = await app.stepFrame(frameDt, cfg.substeps, cfg.renderStride);
        // beauty pass
        app.drawFrame(snap, {
          recording: true,
          indicator: cfg.includeIndicator,
          renderStyle: cfg.renderStyle,
          shadows: cfg.shadows,
        });

        if (isVideo) {
          capCtx.drawImage(app.canvas, 0, 0, W, H);
          const frame = new VideoFrame(capCanvas, {
            timestamp: Math.round(f * 1e6 / cfg.fps),
            duration: Math.round(1e6 / cfg.fps),
          });
          video.encoder.encode(frame, { keyFrame: f % (cfg.fps * 2) === 0 });
          frame.close();
          while (video.encoder.encodeQueueSize > 4) await sleep(4);
        } else {
          const beauty = await this.capture(app.canvas, capCanvas, capCtx, cfg.scale);
          await pngSink.write(`frame_${pad(f)}.png`, beauty);
          if (cfg.format === 'png-alpha') {
            app.drawFrame(snap, {
              recording: true,
              indicator: false,
              alphaOnly: true,
              renderStyle: cfg.renderStyle,
              shadows: cfg.shadows,
            });
            const alpha = await this.capture(app.canvas, capCanvas, capCtx, cfg.scale);
            await pngSink.write(`filings_alpha_${pad(f)}.png`, alpha);
          }
        }
        onProgress(f + 1, totalFrames);
        await sleep(0); // yield to keep the tab responsive
      }

      if (this.cancelled) {
        if (video) { try { await video.encoder.flush(); } catch (_) {} }
        return { cancelled: true };
      }

      const metaBytes = new TextEncoder().encode(JSON.stringify(meta, null, 2));
      if (isVideo) {
        await video.encoder.flush();
        video.muxer.finalize();
        const ext = cfg.format;
        const mime = ext === 'mp4' ? 'video/mp4' : 'video/webm';
        download(new Blob([video.muxer.target.buffer], { type: mime }),
          `take_${app.takeHash}.${ext}`);
        download(new Blob([metaBytes], { type: 'application/json' }),
          `take_${app.takeHash}.json`);
      } else {
        await pngSink.write(`take_${app.takeHash}.json`, new Blob([metaBytes]));
        await pngSink.close();
      }
      return { frames: totalFrames };
    } finally {
      app.recording = false;
    }
  }

  cancel() { this.cancelled = true; }

  async setupVideo(cfg, W, H) {
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('WebCodecs not available — use Chrome/Edge, or record a PNG sequence.');
    }
    const tryConfigs = cfg.format === 'mp4'
      ? [
          { codec: cfg.fps >= 60 ? 'avc1.640034' : 'avc1.640033', kind: 'avc' },
          { codec: 'avc1.640033', kind: 'avc' },
        ]
      : [{ codec: 'vp09.00.50.08', kind: 'V_VP9' }];
    let chosen = null;
    for (const c of tryConfigs) {
      const support = await VideoEncoder.isConfigSupported({
        codec: c.codec, width: W, height: H, bitrate: 40e6, framerate: cfg.fps,
      });
      if (support.supported) { chosen = c; break; }
    }
    if (!chosen) throw new Error(`No supported ${cfg.format.toUpperCase()} encoder at ${W}×${H}@${cfg.fps} — try WebM or a lower resolution.`);

    let muxer;
    if (cfg.format === 'mp4') {
      muxer = new Mp4Muxer({
        target: new Mp4Target(),
        video: { codec: 'avc', width: W, height: H, frameRate: cfg.fps },
        fastStart: 'in-memory',
      });
    } else {
      muxer = new WebmMuxer({
        target: new WebmTarget(),
        video: { codec: 'V_VP9', width: W, height: H, frameRate: cfg.fps },
      });
    }
    const encoder = new VideoEncoder({
      output: (chunk, m) => muxer.addVideoChunk(chunk, m),
      error: (e) => console.error('encoder error', e),
    });
    encoder.configure({
      codec: chosen.codec, width: W, height: H,
      bitrate: 40e6, framerate: cfg.fps,
      latencyMode: 'quality',
    });
    return { muxer, encoder };
  }

  async setupPngSink(cfg) {
    // Prefer a real directory (streams to disk, unbounded takes);
    // fall back to an in-memory store-only zip.
    if (window.showDirectoryPicker) {
      try {
        const root = await window.showDirectoryPicker({ mode: 'readwrite' });
        const dir = await root.getDirectoryHandle(`take_${this.app.takeHash}`, { create: true });
        return {
          async write(name, blob) {
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
          },
          async close() {},
        };
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('recording cancelled — no folder chosen');
        // fall through to zip
      }
    }
    const zip = new ZipStore();
    const app = this.app;
    return {
      async write(name, blob) {
        zip.add(name, new Uint8Array(await blob.arrayBuffer()));
      },
      async close() {
        download(zip.finalize(), `take_${app.takeHash}_png_seq.zip`);
      },
    };
  }

  async capture(canvas, capCanvas, capCtx, scale) {
    if (scale !== 1) {
      capCtx.clearRect(0, 0, capCanvas.width, capCanvas.height);
      capCtx.drawImage(canvas, 0, 0, capCanvas.width, capCanvas.height);
      return capCanvas.convertToBlob({ type: 'image/png' });
    }
    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }
}

function pad(n) { return String(n).padStart(5, '0'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
