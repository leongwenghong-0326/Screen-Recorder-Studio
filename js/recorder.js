/**
 * Recorder Engine Module for Screen Recorder Studio
 * Manages MediaRecorder lifecycle, accurate duration tracking, pause/resume, and Blob creation.
 */

export class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.state = 'idle'; // 'idle' | 'screen_selected' | 'recording' | 'paused' | 'processing' | 'review' | 'error'

    // Timing
    this.startTime = 0;
    this.pauseStartTime = 0;
    this.totalPausedDuration = 0;
    this.timerInterval = null;
    this.currentDuration = 0;

    // Callbacks
    this.onStateChange = null;
    this.onTimerTick = null;
    this.onError = null;
  }

  /**
   * Discovers the best supported MIME type in this browser environment.
   * @returns {string} Supported MIME type
   */
  static getSupportedMimeTypes() {
    // Prioritize fast real-time encoding (VP8 and H.264) over CPU-heavy VP9
    const candidateTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/webm',
      'video/webm;codecs=vp9,opus',
      'video/mp4'
    ];

    return candidateTypes.filter(type => {
      try {
        return window.MediaRecorder && MediaRecorder.isTypeSupported(type);
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Helper to get appropriate file extension for a given MIME type.
   * @param {string} mimeType
   * @returns {string} '.webm' or '.mp4'
   */
  static getFileExtension(mimeType) {
    if (mimeType.includes('mp4')) return '.mp4';
    return '.webm';
  }

  /**
   * Formats a technical MIME type string into a clean, human-readable label.
   * e.g. 'video/webm;codecs=vp9,opus' -> 'WebM (VP9 • Opus)'
   * @param {string} mimeType
   * @returns {string}
   */
  static formatCodecLabel(mimeType) {
    if (!mimeType) return 'Standard Video';
    const lower = mimeType.toLowerCase();
    const isWebm = lower.includes('webm');
    const isMp4 = lower.includes('mp4');
    const container = isMp4 ? 'MP4' : isWebm ? 'WebM' : 'Video';

    let videoCodec = '';
    if (lower.includes('vp9')) videoCodec = 'VP9';
    else if (lower.includes('vp8')) videoCodec = 'VP8';
    else if (lower.includes('avc1') || lower.includes('h264') || lower.includes('h.264')) videoCodec = 'H.264';
    else if (lower.includes('hevc') || lower.includes('h265')) videoCodec = 'H.265';
    else if (lower.includes('av1')) videoCodec = 'AV1';

    let audioCodec = '';
    if (lower.includes('opus')) audioCodec = 'Opus';
    else if (lower.includes('mp4a') || lower.includes('aac')) audioCodec = 'AAC';

    if (videoCodec && audioCodec) {
      return `${container} (${videoCodec} • ${audioCodec})`;
    } else if (videoCodec) {
      return `${container} (${videoCodec})`;
    } else if (audioCodec) {
      return `${container} (${audioCodec})`;
    }

    return container;
  }

  /**
   * Transition recorder state and fire callback.
   * @param {string} newState
   */
  setState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state);
    }
  }

  /**
   * Starts recording a MediaStream.
   * @param {MediaStream} stream
   * @param {Object} options
   */
  start(stream, options = {}) {
    if (!stream || stream.getTracks().length === 0) {
      throw new Error('Cannot start recording: No active media stream provided.');
    }

    if (this.state === 'recording' || this.state === 'paused') {
      console.warn('MediaRecorder is already active.');
      return;
    }

    this.recordedChunks = [];
    this.totalPausedDuration = 0;
    this.currentDuration = 0;

    // Determine MIME type
    const supportedList = ScreenRecorder.getSupportedMimeTypes();
    let selectedMimeType = options.mimeType;

    if (!selectedMimeType || !MediaRecorder.isTypeSupported(selectedMimeType)) {
      selectedMimeType = supportedList[0] || '';
    }

    const recorderOptions = {};
    if (selectedMimeType) {
      recorderOptions.mimeType = selectedMimeType;
    }
    if (options.videoBitsPerSecond) {
      recorderOptions.videoBitsPerSecond = Number(options.videoBitsPerSecond);
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
    } catch (e) {
      // Fallback without explicit options if options were rejected
      console.warn('MediaRecorder with specified options failed, falling back to default constructor:', e);
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error event:', event.error);
      this.setState('error');
      if (typeof this.onError === 'function') {
        this.onError(event.error || new Error('Unknown recording error'));
      }
    };

    this.mediaRecorder.onpause = () => {
      this.pauseStartTime = Date.now();
      this.setState('paused');
    };

    this.mediaRecorder.onresume = () => {
      if (this.pauseStartTime > 0) {
        this.totalPausedDuration += Date.now() - this.pauseStartTime;
        this.pauseStartTime = 0;
      }
      this.setState('recording');
    };

    // Request data every 1000ms for robust chunking
    this.mediaRecorder.start(1000);
    this.startTime = Date.now();
    this.setState('recording');

    // Start timer interval
    this.startTimer();
  }

  /**
   * Pauses active recording.
   */
  pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resumes paused recording.
   */
  resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  /**
   * Stops recording and creates output Blob with metadata.
   * @param {HTMLVideoElement|null} previewElement (for thumbnail generation)
   * @returns {Promise<Object>}
   */
  async stop(previewElement = null) {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return null;
    }

    this.stopTimer();
    this.setState('processing');

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = async () => {
        try {
          const finalMimeType = this.mediaRecorder.mimeType || 'video/webm';
          const blob = new Blob(this.recordedChunks, { type: finalMimeType });

          // Calculate final clean duration (excluding pause)
          let finalDurationMs = (Date.now() - this.startTime) - this.totalPausedDuration;
          if (this.pauseStartTime > 0) {
            finalDurationMs -= (Date.now() - this.pauseStartTime);
          }
          finalDurationMs = Math.max(0, finalDurationMs);

          // Extract thumbnail
          let thumbnail = null;
          let width = 1920;
          let height = 1080;

          if (previewElement) {
            const isVideo = previewElement instanceof HTMLVideoElement;
            const w = isVideo ? previewElement.videoWidth : previewElement.width;
            const h = isVideo ? previewElement.videoHeight : previewElement.height;
            if (w > 0 && h > 0) {
              width = w;
              height = h;
              thumbnail = ScreenRecorder.generateThumbnail(previewElement);
            }
          }

          const result = {
            blob,
            duration: Math.round(finalDurationMs / 1000),
            durationFormatted: ScreenRecorder.formatSeconds(Math.round(finalDurationMs / 1000)),
            mimeType: finalMimeType,
            size: blob.size,
            sizeFormatted: ScreenRecorder.formatFileSize(blob.size),
            width,
            height,
            thumbnail
          };

          this.setState('review');
          resolve(result);
        } catch (err) {
          this.setState('error');
          reject(err);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Starts internal elapsed timer tick.
   */
  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.state === 'recording') {
        const elapsedMs = (Date.now() - this.startTime) - this.totalPausedDuration;
        const totalSecs = Math.max(0, Math.floor(elapsedMs / 1000));
        this.currentDuration = totalSecs;

        if (typeof this.onTimerTick === 'function') {
          this.onTimerTick(totalSecs, ScreenRecorder.formatSeconds(totalSecs));
        }
      }
    }, 250);
  }

  /**
   * Stops timer interval.
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Captures a still snapshot frame from a video element.
   * @param {HTMLVideoElement} videoElement
   * @param {string} format 'image/png' or 'image/jpeg'
   * @returns {{dataUrl: string, blob: Blob}}
   */
  static captureSnapshot(videoElement, format = 'image/png') {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      throw new Error('Video frame is not ready for snapshot capture.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL(format, 0.95);
    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height
    };
  }

  /**
   * Generates a high-resolution crisp thumbnail dataURL for library storage.
   * Supports both HTMLVideoElement and HTMLCanvasElement.
   * @param {HTMLVideoElement|HTMLCanvasElement} mediaElement
   * @returns {string|null} DataURL
   */
  static generateThumbnail(mediaElement) {
    if (!mediaElement) return null;
    try {
      const isVideo = mediaElement instanceof HTMLVideoElement;
      const w = isVideo ? mediaElement.videoWidth : mediaElement.width;
      const h = isVideo ? mediaElement.videoHeight : mediaElement.height;
      if (!w || !h) return null;

      const canvas = document.createElement('canvas');
      const aspect = w / h;
      // Use 720p width for ultra-sharp thumbnails on HiDPI and modern screens
      const thumbWidth = Math.min(w, 720);
      canvas.width = thumbWidth;
      canvas.height = Math.round(thumbWidth / aspect);

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mediaElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      console.warn('Failed to generate thumbnail:', e);
      return null;
    }
  }

  /**
   * Formats seconds into HH:MM:SS string.
   * @param {number} totalSeconds
   * @returns {string}
   */
  static formatSeconds(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  }

  /**
   * Formats bytes into human-readable string (KB, MB, GB).
   * @param {number} bytes
   * @returns {string}
   */
  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
