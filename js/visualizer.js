/**
 * Audio Visualizer Module for Screen Recorder Studio
 * Drives live microphone audio level bars in the studio HUD.
 */

export class AudioVisualizer {
  constructor(barsContainerElement) {
    this.container = barsContainerElement;
    this.bars = this.container ? Array.from(this.container.querySelectorAll('.audio-bar')) : [];
    this.mixer = null;
    this.animationId = null;
    this.isActive = false;
  }

  /**
   * Starts visualizer render loop.
   * @param {AudioMixer} mixer
   */
  start(mixer) {
    this.mixer = mixer;
    this.isActive = true;
    this.animate();
  }

  /**
   * Main animation tick using requestAnimationFrame.
   */
  animate() {
    if (!this.isActive) return;

    const level = this.mixer ? this.mixer.getMicLevel() : 0;
    
    // Distribute level across the 5 indicator bars
    this.bars.forEach((bar, idx) => {
      // Threshold per bar
      const threshold = (idx + 1) / (this.bars.length + 1);
      const intensity = Math.max(0, Math.min(1, (level * 1.5) - (threshold * 0.4)));
      const heightPx = Math.max(3, Math.round(intensity * 16));
      bar.style.height = `${heightPx}px`;

      // Color coding: green -> amber -> red
      if (idx >= 3 && intensity > 0.7) {
        bar.style.background = '#ef4444'; // Red peak
      } else if (idx >= 2 && intensity > 0.5) {
        bar.style.background = '#f59e0b'; // Amber warn
      } else {
        bar.style.background = '#34d399'; // Emerald normal
      }
    });

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  /**
   * Stops animation loop and resets bars.
   */
  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.bars.forEach(bar => {
      bar.style.height = '3px';
      bar.style.background = '#34d399';
    });
  }
}
