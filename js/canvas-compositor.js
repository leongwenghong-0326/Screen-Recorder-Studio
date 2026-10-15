/**
 * Canvas Compositor Module for Screen Recorder Studio
 * Real-time, high-performance compositing of screen video and webcam PiP overlay.
 * Uses Worker-assisted pacing to prevent background-tab FPS throttling and avoids software blur filters.
 */

export class CanvasCompositor {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    // Enable desynchronized hint for low-latency hardware canvas pipeline
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // Video sources
    this.screenVideo = null;
    this.webcamVideo = null;

    // Overlay settings
    this.isWebcamEnabled = false;
    this.pipShape = 'rect'; // 'rect' or 'circle'
    this.isMirrored = false;

    // Normalized position within stage (0.0 to 1.0)
    this.pipNormX = 0.8;
    this.pipNormY = 0.75;
    this.pipScale = 0.22; // 22% of screen width

    // Target stream parameters
    this.targetWidth = 1920;
    this.targetHeight = 1080;
    this.targetFps = 30;

    this.isActive = false;
    this.animationId = null;
    this.compositedStream = null;

    // Background worker timer
    this.worker = null;
    this.workerUrl = null;
    this.lastRenderTime = 0;
  }

  /**
   * Initializes background web worker to prevent browser from throttling canvas FPS when tab is not focused.
   */
  initWorkerTimer() {
    if (this.worker) return;

    try {
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data.action === 'start') {
            const interval = e.data.interval || 33;
            if (timer) clearInterval(timer);
            timer = setInterval(() => self.postMessage('tick'), interval);
          } else if (e.data.action === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerUrl);

      this.worker.onmessage = () => {
        if (this.isActive) {
          // If requestAnimationFrame has not fired recently (e.g. background tab), tick here
          const now = performance.now();
          if (now - this.lastRenderTime >= (1000 / this.targetFps) * 0.85) {
            this.renderFrame();
          }
        }
      };
    } catch (e) {
      console.warn('Worker timer could not be initialized:', e);
    }
  }

  /**
   * Sets the canvas dimensions based on chosen target resolution or native screen.
   * @param {number} width
   * @param {number} height
   * @param {number} fps
   */
  setResolution(width, height, fps = 30) {
    this.targetWidth = width;
    this.targetHeight = height;
    this.targetFps = fps;

    this.canvas.width = this.targetWidth;
    this.canvas.height = this.targetHeight;
  }

  /**
   * Starts compositor loop.
   * @param {HTMLVideoElement} screenVideo
   * @param {HTMLVideoElement|null} webcamVideo
   * @param {boolean} isWebcamActive
   * @returns {MediaStream}
   */
  start(screenVideo, webcamVideo = null, isWebcamActive = false) {
    this.screenVideo = screenVideo;
    this.webcamVideo = webcamVideo;
    this.isWebcamEnabled = isWebcamActive;
    this.isActive = true;

    // Adjust canvas resolution to match screen video's native dimensions if not explicitly set
    if (this.screenVideo && this.screenVideo.videoWidth > 0) {
      if (this.targetWidth === 'native' || !this.targetWidth) {
        this.targetWidth = this.screenVideo.videoWidth;
        this.targetHeight = this.screenVideo.videoHeight;
        this.canvas.width = this.targetWidth;
        this.canvas.height = this.targetHeight;
      }
    }

    // Capture canvas stream if not already active
    if (!this.compositedStream || this.compositedStream.getVideoTracks().every(t => t.readyState === 'ended')) {
      this.compositedStream = this.canvas.captureStream(this.targetFps);
    }

    // Start background worker pacing
    this.initWorkerTimer();
    if (this.worker) {
      const intervalMs = Math.round(1000 / this.targetFps);
      this.worker.postMessage({ action: 'start', interval: intervalMs });
    }

    if (!this.animationId) {
      this.renderLoop();
    }

    return this.compositedStream;
  }

  /**
   * Main render loop driven by requestAnimationFrame when foregrounded.
   */
  renderLoop() {
    if (!this.isActive) return;

    this.renderFrame();
    this.animationId = requestAnimationFrame(() => this.renderLoop());
  }

  /**
   * Draws a single frame to the canvas (optimized for speed with 0% CPU blur overhead).
   */
  renderFrame() {
    this.lastRenderTime = performance.now();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const ctx = this.ctx;

    // 1. Draw Screen Video (letterbox/pillarbox to maintain aspect ratio)
    if (this.screenVideo && (this.screenVideo.videoWidth > 0 || this.screenVideo.readyState >= 2)) {
      const sw = this.screenVideo.videoWidth || cw;
      const sh = this.screenVideo.videoHeight || ch;
      const scale = Math.min(cw / sw, ch / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      // Fill black background only if letterboxed
      if (dw < cw || dh < ch) {
        ctx.fillStyle = '#06090e';
        ctx.fillRect(0, 0, cw, ch);
      }

      ctx.drawImage(this.screenVideo, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = '#06090e';
      ctx.fillRect(0, 0, cw, ch);
    }

    // 2. Draw Webcam PiP overlay if active
    if (this.isWebcamEnabled && this.webcamVideo && (this.webcamVideo.videoWidth > 0 || this.webcamVideo.readyState >= 2)) {
      this.drawWebcamOverlay(ctx, cw, ch);
    }
  }

  /**
   * Renders the webcam overlay at configured coordinates and shape.
   * High performance: no shadowBlur (which causes CPU Gaussian blur slowdown).
   */
  drawWebcamOverlay(ctx, cw, ch) {
    const vw = this.webcamVideo.videoWidth || 640;
    const vh = this.webcamVideo.videoHeight || 480;
    const aspect = vw / vh;

    // Determine overlay dimensions
    let overlayW = cw * this.pipScale;
    let overlayH = overlayW / aspect;

    if (this.pipShape === 'circle') {
      overlayH = overlayW; // 1:1 for circle
    }

    // Coordinates bounded within canvas
    let x = this.pipNormX * cw;
    let y = this.pipNormY * ch;

    // Keep fully inside canvas
    x = Math.max(16, Math.min(cw - overlayW - 16, x));
    y = Math.max(16, Math.min(ch - overlayH - 16, y));

    ctx.save();

    if (this.pipShape === 'circle') {
      const radius = overlayW / 2;
      const cx = x + radius;
      const cy = y + radius;

      // Clip path for video
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Mirror transform if enabled
      if (this.isMirrored) {
        ctx.translate(cx, cy);
        ctx.scale(-1, 1);
        ctx.translate(-cx, -cy);
      }

      // Draw webcam video cropped to circle center
      const cropSize = Math.min(vw, vh);
      const sx = (vw - cropSize) / 2;
      const sy = (vh - cropSize) / 2;
      ctx.drawImage(this.webcamVideo, sx, sy, cropSize, cropSize, x, y, overlayW, overlayH);
      ctx.restore();

      // Double high-contrast border without Gaussian blur penalty
      ctx.save();
      // Outer dark border for contrast
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
      ctx.stroke();

      // Inner crisp white border
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

    } else {
      // Rounded Rectangle
      const radius = 14;

      // Clip video
      ctx.save();
      this.drawRoundedRect(ctx, x, y, overlayW, overlayH, radius);
      ctx.clip();

      if (this.isMirrored) {
        ctx.translate(x + overlayW / 2, y + overlayH / 2);
        ctx.scale(-1, 1);
        ctx.translate(-(x + overlayW / 2), -(y + overlayH / 2));
      }

      ctx.drawImage(this.webcamVideo, 0, 0, vw, vh, x, y, overlayW, overlayH);
      ctx.restore();

      // Clean double border without blur overhead
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      this.drawRoundedRect(ctx, x - 1, y - 1, overlayW + 2, overlayH + 2, radius + 1);
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      this.drawRoundedRect(ctx, x, y, overlayW, overlayH, radius);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Helper to draw a rounded rectangle path.
   */
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Updates normalized webcam coordinates based on stage element drag.
   * @param {number} normX 0.0 to 1.0
   * @param {number} normY 0.0 to 1.0
   */
  updateOverlayPosition(normX, normY) {
    this.pipNormX = Math.max(0, Math.min(1.0, normX));
    this.pipNormY = Math.max(0, Math.min(1.0, normY));
  }

  /**
   * Sets webcam overlay parameters.
   */
  setOverlayConfig({ isEnabled, shape, isMirrored, scale }) {
    if (isEnabled !== undefined) this.isWebcamEnabled = isEnabled;
    if (shape !== undefined) this.pipShape = shape;
    if (isMirrored !== undefined) this.isMirrored = isMirrored;
    if (scale !== undefined) this.pipScale = scale;
  }

  /**
   * Stops the compositor loop and cleans up workers.
   */
  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.worker) {
      this.worker.postMessage({ action: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    if (this.compositedStream) {
      this.compositedStream.getTracks().forEach(t => t.stop());
      this.compositedStream = null;
    }
  }
}
