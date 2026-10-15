/**
 * Audio Mixer Module for Screen Recorder Studio
 * Combines microphone and system audio with independent gain controls and audio analysis.
 */

export class AudioMixer {
  constructor() {
    this.audioCtx = null;
    this.destination = null;

    // Mic chain
    this.micStream = null;
    this.micSourceNode = null;
    this.micGainNode = null;
    this.micAnalyserNode = null;

    // System audio chain
    this.systemStream = null;
    this.systemSourceNode = null;
    this.systemGainNode = null;

    // Volumes
    this.micVolume = 1.0;
    this.systemVolume = 1.0;

    // Analysis buffer
    this.analysisDataArray = null;
  }

  /**
   * Initializes or resumes the AudioContext safely upon user gesture.
   */
  ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }
      this.audioCtx = new AudioContextClass();
      this.destination = this.audioCtx.createMediaStreamDestination();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Sets or replaces the microphone stream.
   * @param {MediaStream|null} stream
   */
  setMicStream(stream) {
    if (!stream || stream.getAudioTracks().length === 0) {
      this.removeMicStream();
      return;
    }

    this.ensureContext();

    // Clean up existing mic nodes if any
    this.removeMicStream();

    this.micStream = stream;
    try {
      this.micSourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.micGainNode = this.audioCtx.createGain();
      this.micGainNode.gain.setValueAtTime(this.micVolume, this.audioCtx.currentTime);

      this.micAnalyserNode = this.audioCtx.createAnalyser();
      this.micAnalyserNode.fftSize = 64;
      this.micAnalyserNode.smoothingTimeConstant = 0.5;
      this.analysisDataArray = new Uint8Array(this.micAnalyserNode.frequencyBinCount);

      // Connect: MicSource -> Gain -> Destination & Analyser
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.destination);
      this.micGainNode.connect(this.micAnalyserNode);
    } catch (err) {
      console.error('Failed to configure microphone in audio mixer:', err);
    }
  }

  /**
   * Removes current microphone source.
   */
  removeMicStream() {
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.micSourceNode = null;
    }
    if (this.micGainNode) {
      try {
        this.micGainNode.disconnect();
      } catch (e) {}
      this.micGainNode = null;
    }
    if (this.micAnalyserNode) {
      try {
        this.micAnalyserNode.disconnect();
      } catch (e) {}
      this.micAnalyserNode = null;
    }
    this.micStream = null;
  }

  /**
   * Sets or replaces the system/display audio stream.
   * @param {MediaStream|null} stream
   */
  setSystemStream(stream) {
    if (!stream || stream.getAudioTracks().length === 0) {
      this.removeSystemStream();
      return;
    }

    this.ensureContext();
    this.removeSystemStream();

    this.systemStream = stream;
    try {
      this.systemSourceNode = this.audioCtx.createMediaStreamSource(this.systemStream);
      this.systemGainNode = this.audioCtx.createGain();
      this.systemGainNode.gain.setValueAtTime(this.systemVolume, this.audioCtx.currentTime);

      // Connect: SystemSource -> Gain -> Destination
      this.systemSourceNode.connect(this.systemGainNode);
      this.systemGainNode.connect(this.destination);
    } catch (err) {
      console.error('Failed to configure system audio in audio mixer:', err);
    }
  }

  /**
   * Removes current system audio source.
   */
  removeSystemStream() {
    if (this.systemSourceNode) {
      try {
        this.systemSourceNode.disconnect();
      } catch (e) {}
      this.systemSourceNode = null;
    }
    if (this.systemGainNode) {
      try {
        this.systemGainNode.disconnect();
      } catch (e) {}
      this.systemGainNode = null;
    }
    this.systemStream = null;
  }

  /**
   * Adjusts the microphone gain (0.0 to 2.0).
   * @param {number} gainValue
   */
  setMicVolume(gainValue) {
    this.micVolume = Math.max(0, Math.min(2.0, gainValue));
    if (this.micGainNode && this.audioCtx) {
      this.micGainNode.gain.setTargetAtTime(this.micVolume, this.audioCtx.currentTime, 0.05);
    }
  }

  /**
   * Adjusts the system audio volume (0.0 to 2.0).
   * @param {number} gainValue
   */
  setSystemVolume(gainValue) {
    this.systemVolume = Math.max(0, Math.min(2.0, gainValue));
    if (this.systemGainNode && this.audioCtx) {
      this.systemGainNode.gain.setTargetAtTime(this.systemVolume, this.audioCtx.currentTime, 0.05);
    }
  }

  /**
   * Calculates normalized peak volume level from the analyser node.
   * @returns {number} Range 0.0 to 1.0
   */
  getMicLevel() {
    if (!this.micAnalyserNode || !this.analysisDataArray) return 0;
    this.micAnalyserNode.getByteFrequencyData(this.analysisDataArray);
    let sum = 0;
    for (let i = 0; i < this.analysisDataArray.length; i++) {
      sum += this.analysisDataArray[i];
    }
    const avg = sum / this.analysisDataArray.length;
    return Math.min(1.0, avg / 128);
  }

  /**
   * Returns mixed audio tracks for inclusion in the final recording stream.
   * @returns {Array<MediaStreamTrack>}
   */
  getMixedAudioTracks() {
    if (this.destination && (this.micStream || this.systemStream)) {
      return this.destination.stream.getAudioTracks();
    }
    return [];
  }

  /**
   * Returns whether any audio source is actively connected.
   * @returns {boolean}
   */
  hasActiveAudio() {
    return Boolean(
      (this.micStream && this.micStream.getAudioTracks().some(t => t.readyState === 'live')) ||
      (this.systemStream && this.systemStream.getAudioTracks().some(t => t.readyState === 'live'))
    );
  }

  /**
   * Cleans up all audio nodes and closes the AudioContext.
   */
  destroy() {
    this.removeMicStream();
    this.removeSystemStream();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
