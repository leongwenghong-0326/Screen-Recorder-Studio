/**
 * Main Application Module for Screen Recorder Studio
 * Orchestrates UI interactions, media streams, recording state machine, and storage.
 */

import { ScreenRecorder } from './recorder.js';
import { AudioMixer } from './audio-mixer.js';
import { CanvasCompositor } from './canvas-compositor.js';
import { AudioVisualizer } from './visualizer.js';
import { storage } from './storage.js';

class StudioApp {
  constructor() {
    // Media streams
    this.screenStream = null;
    this.micStream = null;
    this.webcamStream = null;

    // Engine instances
    this.recorder = new ScreenRecorder();
    this.mixer = new AudioMixer();
    this.compositor = null;
    this.visualizer = null;

    // Active state
    this.isCompositorMode = false;
    this.isWebcamActive = false;
    this.isMicActive = false;
    this.currentReviewData = null;
    this.currentReviewObjectUrl = null;

    // Draggable PiP state
    this.isDraggingPip = false;
    this.pipDragOffset = { x: 0, y: 0 };

    // Default settings
    this.settings = {
      resolution: '1920x1080',
      fps: 30,
      bitrate: 6000000,
      mimeType: '',
      echoCancellation: true,
      noiseSuppression: true,
      micGain: 1.0,
      systemGain: 1.0,
      pipShape: 'rect',
      pipScale: 0.22,
      pipMirrored: false
    };

    this.loadSettings();
  }

  /**
   * Initializes the application once the DOM is ready.
   */
  async init() {
    this.cacheDomElements();
    this.setupCompositor();
    this.setupVisualizer();
    this.populateMimeTypes();
    this.applySettingsToUi();
    this.bindEvents();
    this.initRecorderCallbacks();
    this.updateLibraryCountBadge();

    // Verify browser support
    this.verifyBrowserSupport();

    // Auto-open modal if specified in URL query (useful for deep links & documentation)
    const urlParams = new URLSearchParams(window.location.search);
    const openParam = urlParams.get('open');
    if (openParam === 'shortcuts') {
      this.openModal(this.shortcutsModal);
    } else if (openParam === 'settings') {
      this.openModal(this.settingsModal);
    } else if (openParam === 'library') {
      this.openLibraryModal();
    }
  }

  /**
   * Caches all required DOM elements.
   */
  cacheDomElements() {
    // Header
    this.statusBadge = document.getElementById('statusBadge');
    this.statusBadgeText = document.getElementById('statusBadgeText');
    this.streamSpecBadge = document.getElementById('streamSpecBadge');
    this.btnShortcutsHelp = document.getElementById('btnShortcutsHelp');
    this.btnOpenLibrary = document.getElementById('btnOpenLibrary');
    this.libraryCountBadge = document.getElementById('libraryCountBadge');
    this.btnOpenSettings = document.getElementById('btnOpenSettings');

    // Stage
    this.stageWrapper = document.getElementById('stageWrapper');
    this.screenVideo = document.getElementById('screenVideo');
    this.compositorCanvas = document.getElementById('compositorCanvas');
    this.stageEmptyState = document.getElementById('stageEmptyState');
    this.btnSelectScreenEmpty = document.getElementById('btnSelectScreenEmpty');

    // HUD
    this.hudTimerBadge = document.getElementById('hudTimerBadge');
    this.hudTimerText = document.getElementById('hudTimerText');
    this.hudPausedBadge = document.getElementById('hudPausedBadge');
    this.hudAudioMeter = document.getElementById('hudAudioMeter');
    this.audioBarsContainer = document.getElementById('audioBarsContainer');

    // Webcam PiP
    this.webcamPipContainer = document.getElementById('webcamPipContainer');
    this.webcamVideo = document.getElementById('webcamVideo');
    this.btnPipShape = document.getElementById('btnPipShape');
    this.btnPipMirror = document.getElementById('btnPipMirror');
    this.btnPipClose = document.getElementById('btnPipClose');

    // Recording Dock
    this.btnDockSelectScreen = document.getElementById('btnDockSelectScreen');
    this.dockScreenLabel = document.getElementById('dockScreenLabel');
    this.btnDockMic = document.getElementById('btnDockMic');
    this.dockMicLabel = document.getElementById('dockMicLabel');
    this.micVolumePopover = document.getElementById('micVolumePopover');
    this.popoverMicGainVal = document.getElementById('popoverMicGainVal');
    this.popoverMicSlider = document.getElementById('popoverMicSlider');
    this.btnDockWebcam = document.getElementById('btnDockWebcam');
    this.dockWebcamLabel = document.getElementById('dockWebcamLabel');
    this.btnDockCompositor = document.getElementById('btnDockCompositor');
    this.dockCompositorLabel = document.getElementById('dockCompositorLabel');
    this.btnDockRecord = document.getElementById('btnDockRecord');
    this.btnRecordLabel = document.getElementById('btnRecordLabel');
    this.btnDockPause = document.getElementById('btnDockPause');
    this.iconPause = document.getElementById('iconPause');
    this.iconResume = document.getElementById('iconResume');
    this.btnPauseLabel = document.getElementById('btnPauseLabel');
    this.btnDockStop = document.getElementById('btnDockStop');
    this.btnDockSnapshot = document.getElementById('btnDockSnapshot');

    // Modals
    this.settingsModal = document.getElementById('settingsModal');
    this.btnCloseSettings = document.getElementById('btnCloseSettings');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.btnResetSettings = document.getElementById('btnResetSettings');
    this.settingResolution = document.getElementById('settingResolution');
    this.settingFps = document.getElementById('settingFps');
    this.settingBitrate = document.getElementById('settingBitrate');
    this.settingFormat = document.getElementById('settingFormat');
    this.settingEchoCancellation = document.getElementById('settingEchoCancellation');
    this.settingNoiseSuppression = document.getElementById('settingNoiseSuppression');
    this.settingMicGain = document.getElementById('settingMicGain');
    this.settingMicGainVal = document.getElementById('settingMicGainVal');
    this.settingSystemGain = document.getElementById('settingSystemGain');
    this.settingSystemGainVal = document.getElementById('settingSystemGainVal');
    this.settingPipShape = document.getElementById('settingPipShape');
    this.settingPipSize = document.getElementById('settingPipSize');

    // Review Modal
    this.reviewModal = document.getElementById('reviewModal');
    this.btnCloseReview = document.getElementById('btnCloseReview');
    this.reviewVideoPlayer = document.getElementById('reviewVideoPlayer');
    this.reviewMetaDuration = document.getElementById('reviewMetaDuration');
    this.reviewMetaSize = document.getElementById('reviewMetaSize');
    this.reviewMetaDimensions = document.getElementById('reviewMetaDimensions');
    this.reviewMetaFormat = document.getElementById('reviewMetaFormat');
    this.reviewMetaMimeSub = document.getElementById('reviewMetaMimeSub');
    this.btnReviewSnapshot = document.getElementById('btnReviewSnapshot');
    this.btnSaveToLibrary = document.getElementById('btnSaveToLibrary');
    this.btnSaveToLibraryText = document.getElementById('btnSaveToLibraryText');
    this.btnDownloadRecording = document.getElementById('btnDownloadRecording');

    // Library Modal
    this.libraryModal = document.getElementById('libraryModal');
    this.btnCloseLibrary = document.getElementById('btnCloseLibrary');
    this.btnCloseLibraryFooter = document.getElementById('btnCloseLibraryFooter');
    this.libraryStorageEstimate = document.getElementById('libraryStorageEstimate');
    this.libraryGrid = document.getElementById('libraryGrid');

    // Shortcuts Modal
    this.shortcutsModal = document.getElementById('shortcutsModal');
    this.btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
    this.btnCloseShortcutsFooter = document.getElementById('btnCloseShortcutsFooter');

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * Initializes Canvas Compositor.
   */
  setupCompositor() {
    this.compositor = new CanvasCompositor(this.compositorCanvas);
    const { width, height } = this.parseResolution(this.settings.resolution);
    this.compositor.setResolution(width, height, this.settings.fps);
  }

  /**
   * Initializes Audio Visualizer.
   */
  setupVisualizer() {
    this.visualizer = new AudioVisualizer(this.audioBarsContainer);
  }

  /**
   * Checks runtime browser compatibility.
   */
  verifyBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      this.showToast('Browser Notice', 'Screen Capture API is not supported in this browser. Please use Chrome, Edge, or Firefox.', 'error');
    }
    if (!window.MediaRecorder) {
      this.showToast('Browser Notice', 'MediaRecorder API is not available. Recording features will be disabled.', 'error');
    }
  }

  /**
   * Populates supported video formats in settings dropdown.
   */
  populateMimeTypes() {
    const supported = ScreenRecorder.getSupportedMimeTypes();
    this.settingFormat.innerHTML = '';

    if (supported.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Default browser format';
      this.settingFormat.appendChild(opt);
      return;
    }

    supported.forEach(mime => {
      const opt = document.createElement('option');
      opt.value = mime;
      opt.textContent = ScreenRecorder.formatCodecLabel(mime);
      this.settingFormat.appendChild(opt);
    });

    if (!this.settings.mimeType || !supported.includes(this.settings.mimeType)) {
      this.settings.mimeType = supported[0];
    }
  }

  /**
   * Loads saved preferences from localStorage.
   */
  loadSettings() {
    try {
      const stored = localStorage.getItem('screen_recorder_settings');
      if (stored) {
        this.settings = Object.assign(this.settings, JSON.parse(stored));
      }
      // Migrate legacy high-bitrate or laggy VP9 settings to smooth VP8/H.264
      if (!this.settings.bitrate || this.settings.bitrate > 6000000) {
        this.settings.bitrate = 4000000;
      }
      if (this.settings.mimeType && this.settings.mimeType.includes('vp9')) {
        const supported = ScreenRecorder.getSupportedMimeTypes();
        this.settings.mimeType = supported[0] || '';
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
  }

  /**
   * Persists preferences to localStorage.
   */
  saveSettings() {
    try {
      localStorage.setItem('screen_recorder_settings', JSON.stringify(this.settings));
      this.showToast('Settings Saved', 'Your recording preferences have been updated.', 'success');
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  /**
   * Reflects current settings onto UI controls.
   */
  applySettingsToUi() {
    this.settingResolution.value = this.settings.resolution;
    this.settingFps.value = String(this.settings.fps);
    this.settingBitrate.value = String(this.settings.bitrate);
    if (this.settings.mimeType && this.settingFormat.querySelector(`option[value="${this.settings.mimeType}"]`)) {
      this.settingFormat.value = this.settings.mimeType;
    }

    this.settingEchoCancellation.checked = this.settings.echoCancellation;
    this.settingNoiseSuppression.checked = this.settings.noiseSuppression;

    this.settingMicGain.value = Math.round(this.settings.micGain * 100);
    this.settingMicGainVal.textContent = `${Math.round(this.settings.micGain * 100)}%`;
    this.popoverMicSlider.value = Math.round(this.settings.micGain * 100);
    this.popoverMicGainVal.textContent = `${Math.round(this.settings.micGain * 100)}%`;

    this.settingSystemGain.value = Math.round(this.settings.systemGain * 100);
    this.settingSystemGainVal.textContent = `${Math.round(this.settings.systemGain * 100)}%`;

    this.settingPipShape.value = this.settings.pipShape;
    this.settingPipSize.value = this.settings.pipScale === 0.16 ? 'small' : this.settings.pipScale === 0.30 ? 'large' : 'medium';

    this.updateStreamSpecBadge();
  }

  /**
   * Updates top header spec badge.
   */
  updateStreamSpecBadge() {
    let resLabel = '1080p';
    if (this.settings.resolution === '1280x720') resLabel = '720p';
    if (this.settings.resolution === '3840x2160') resLabel = '4K';
    if (this.settings.resolution === 'native') resLabel = 'Native';

    this.streamSpecBadge.textContent = `${resLabel} • ${this.settings.fps} FPS`;
  }

  /**
   * Parses resolution string into dimensions.
   */
  parseResolution(resStr) {
    if (resStr === 'native') return { width: 1920, height: 1080 };
    const parts = resStr.split('x');
    return {
      width: parseInt(parts[0], 10) || 1920,
      height: parseInt(parts[1], 10) || 1080
    };
  }

  /**
   * Connects Recorder lifecycle callbacks.
   */
  initRecorderCallbacks() {
    this.recorder.onStateChange = (state) => {
      this.updateUiState(state);
    };

    this.recorder.onTimerTick = (seconds, formatted) => {
      this.hudTimerText.textContent = formatted;
    };

    this.recorder.onError = (err) => {
      this.showToast('Recording Error', err.message || 'An unexpected error occurred during recording.', 'error');
    };
  }

  /**
   * Synchronizes UI with recorder state.
   */
  updateUiState(state) {
    this.statusBadge.className = 'status-badge';
    this.statusBadge.classList.add(`status-${state}`);

    switch (state) {
      case 'idle':
        this.statusBadgeText.textContent = 'IDLE';
        this.hudTimerBadge.classList.remove('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording', 'is-paused');
        this.btnDockRecord.style.display = 'inline-flex';
        this.btnDockRecord.disabled = !this.screenStream;
        this.btnDockPause.style.display = 'none';
        this.btnDockStop.style.display = 'none';
        this.btnDockSnapshot.disabled = !this.screenStream;
        break;

      case 'screen_selected':
        this.statusBadgeText.textContent = 'READY';
        this.statusBadge.className = 'status-badge status-ready';
        this.hudTimerBadge.classList.remove('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording', 'is-paused');
        this.btnDockRecord.style.display = 'inline-flex';
        this.btnDockRecord.disabled = false;
        this.btnDockPause.style.display = 'none';
        this.btnDockStop.style.display = 'none';
        this.btnDockSnapshot.disabled = false;
        break;

      case 'recording':
        this.statusBadgeText.textContent = 'RECORDING';
        this.statusBadge.className = 'status-badge status-recording';
        this.hudTimerBadge.classList.add('visible');
        this.hudTimerBadge.classList.remove('is-paused');
        this.stageWrapper.classList.add('is-recording');
        this.stageWrapper.classList.remove('is-paused');
        this.btnDockRecord.style.display = 'none';
        this.btnDockPause.style.display = 'inline-flex';
        this.btnDockStop.style.display = 'inline-flex';
        this.iconPause.style.display = 'block';
        this.iconResume.style.display = 'none';
        this.btnPauseLabel.textContent = 'Pause';
        this.btnDockSnapshot.disabled = false;
        break;

      case 'paused':
        this.statusBadgeText.textContent = 'PAUSED';
        this.statusBadge.className = 'status-badge status-paused';
        this.hudTimerBadge.classList.add('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording');
        this.stageWrapper.classList.add('is-paused');
        this.iconPause.style.display = 'none';
        this.iconResume.style.display = 'block';
        this.btnPauseLabel.textContent = 'Resume';
        break;

      case 'processing':
        this.statusBadgeText.textContent = 'PROCESSING';
        this.statusBadge.className = 'status-badge status-processing';
        this.hudTimerBadge.classList.remove('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording', 'is-paused');
        this.btnDockPause.style.display = 'none';
        this.btnDockStop.style.display = 'none';
        this.btnDockRecord.style.display = 'inline-flex';
        this.btnDockRecord.disabled = true;
        break;

      case 'review':
        this.statusBadgeText.textContent = 'READY';
        this.statusBadge.className = 'status-badge status-ready';
        this.hudTimerBadge.classList.remove('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording', 'is-paused');
        this.btnDockRecord.style.display = 'inline-flex';
        this.btnDockRecord.disabled = false;
        this.btnDockPause.style.display = 'none';
        this.btnDockStop.style.display = 'none';
        break;

      case 'error':
        this.statusBadgeText.textContent = 'ERROR';
        this.statusBadge.className = 'status-badge status-recording';
        this.hudTimerBadge.classList.remove('visible', 'is-paused');
        this.stageWrapper.classList.remove('is-recording', 'is-paused');
        this.btnDockRecord.style.display = 'inline-flex';
        this.btnDockRecord.disabled = !this.screenStream;
        this.btnDockPause.style.display = 'none';
        this.btnDockStop.style.display = 'none';
        break;
    }
  }

  /**
   * Binds UI and keyboard events.
   */
  bindEvents() {
    // Screen Selection
    this.btnSelectScreenEmpty.addEventListener('click', () => this.requestScreenCapture());
    this.btnDockSelectScreen.addEventListener('click', () => this.requestScreenCapture());

    // Mic & Webcam
    this.btnDockMic.addEventListener('click', () => this.toggleMicrophone());
    this.btnDockWebcam.addEventListener('click', () => this.toggleWebcam());
    this.btnDockCompositor.addEventListener('click', () => this.toggleCompositorMode());

    // Recording Actions
    this.btnDockRecord.addEventListener('click', () => this.startRecordingSession());
    this.btnDockPause.addEventListener('click', () => this.togglePauseRecording());
    this.btnDockStop.addEventListener('click', () => this.stopRecordingSession());
    this.btnDockSnapshot.addEventListener('click', () => this.takeSnapshot());

    // Mic Volume Slider
    this.popoverMicSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.popoverMicGainVal.textContent = `${val}%`;
      this.settingMicGain.value = val;
      this.settingMicGainVal.textContent = `${val}%`;
      this.settings.micGain = val / 100;
      this.mixer.setMicVolume(this.settings.micGain);
    });

    // Close mic popover on click outside
    document.addEventListener('click', (e) => {
      if (!this.btnDockMic.contains(e.target) && !this.micVolumePopover.contains(e.target)) {
        this.micVolumePopover.classList.remove('open');
      }
    });

    // Webcam PiP toolbar controls
    this.btnPipShape.addEventListener('click', () => this.togglePipShape());
    this.btnPipMirror.addEventListener('click', () => this.togglePipMirror());
    this.btnPipClose.addEventListener('click', () => this.toggleWebcam(false));

    // Webcam PiP Dragging
    this.setupPipDragging();

    // Modals
    this.btnOpenSettings.addEventListener('click', () => this.openModal(this.settingsModal));
    this.btnCloseSettings.addEventListener('click', () => this.closeModal(this.settingsModal));
    this.btnSaveSettings.addEventListener('click', () => this.handleSaveSettings());
    this.btnResetSettings.addEventListener('click', () => this.handleResetSettings());

    this.btnOpenLibrary.addEventListener('click', () => this.openLibraryModal());
    this.btnCloseLibrary.addEventListener('click', () => this.closeModal(this.libraryModal));
    this.btnCloseLibraryFooter.addEventListener('click', () => this.closeModal(this.libraryModal));

    this.btnShortcutsHelp.addEventListener('click', () => this.openModal(this.shortcutsModal));
    this.btnCloseShortcuts.addEventListener('click', () => this.closeModal(this.shortcutsModal));
    this.btnCloseShortcutsFooter.addEventListener('click', () => this.closeModal(this.shortcutsModal));

    // Review Modal Actions
    this.btnCloseReview.addEventListener('click', () => this.closeReviewModal());
    this.btnDownloadRecording.addEventListener('click', () => this.downloadCurrentRecording());
    this.btnSaveToLibrary.addEventListener('click', () => this.saveCurrentRecordingToLibrary());
    this.btnReviewSnapshot.addEventListener('click', () => this.takeReviewSnapshot());

    // Sliders in Settings
    this.settingMicGain.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settingMicGainVal.textContent = `${val}%`;
      this.popoverMicSlider.value = val;
      this.popoverMicGainVal.textContent = `${val}%`;
      this.settings.micGain = val / 100;
      this.mixer.setMicVolume(this.settings.micGain);
    });

    this.settingSystemGain.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settingSystemGainVal.textContent = `${val}%`;
      this.settings.systemGain = val / 100;
      this.mixer.setSystemVolume(this.settings.systemGain);
    });

    // Backdrop click for modals
    [this.settingsModal, this.reviewModal, this.libraryModal, this.shortcutsModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal);
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Keyboard shortcuts handler.
   * Supports physical key codes (e.code) to guarantee reliability regardless of
   * keyboard layout, CapsLock, IME composition, or AltGr character generation.
   * Also supports Ctrl+Shift combos as fallbacks for systems with Alt+R conflicts (e.g. AMD software).
   */
  handleKeydown(e) {
    const isEsc = e.code === 'Escape' || e.key === 'Escape';

    // Handle Escape unconditionally across any active element
    if (isEsc) {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (this.micVolumePopover && this.micVolumePopover.classList.contains('open')) {
        this.micVolumePopover.classList.remove('open');
      }
      const openModals = [this.settingsModal, this.reviewModal, this.libraryModal, this.shortcutsModal].filter(
        m => m && m.classList.contains('open')
      );
      if (openModals.length > 0) {
        e.preventDefault();
        openModals.forEach(m => this.closeModal(m));
        return;
      }
    }

    // Only skip shortcuts for standard editable text inputs / textareas to prevent typing collisions
    const activeEl = document.activeElement;
    const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
    const isTextInput = (tag === 'textarea') ||
      (tag === 'input' && ['text', 'search', 'email', 'password', 'number'].includes(activeEl.type)) ||
      (activeEl?.isContentEditable);

    if (isTextInput && !e.altKey && !e.ctrlKey) {
      return;
    }

    // Modifier check: Standard Alt, AltGr (Ctrl+Alt), or Ctrl+Shift fallback
    const isAlt = e.altKey && !e.metaKey;
    const isCtrlShift = e.ctrlKey && e.shiftKey && !e.metaKey;
    const isShortcutModifier = isAlt || isCtrlShift;

    if (!isShortcutModifier) {
      return;
    }

    // Match physical keys (e.code) first, falling back to lowercased e.key and special layout symbols
    const isKeyR = e.code === 'KeyR' || e.key?.toLowerCase() === 'r' || e.key === '®';
    const isKeyP = e.code === 'KeyP' || e.key?.toLowerCase() === 'p' || e.key === 'π';
    const isKeyM = e.code === 'KeyM' || e.key?.toLowerCase() === 'm' || e.key === 'µ';
    const isKeyW = e.code === 'KeyW' || e.key?.toLowerCase() === 'w' || e.key === '∑';

    if (isKeyR) {
      e.preventDefault();
      e.stopPropagation();
      if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
        this.stopRecordingSession();
      } else if (this.screenStream) {
        this.startRecordingSession();
      } else {
        this.requestScreenCapture();
      }
    } else if (isKeyP) {
      e.preventDefault();
      e.stopPropagation();
      if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
        this.togglePauseRecording();
      } else {
        this.showToast('No Active Recording', 'Press Alt + R to start recording first before pausing.', 'info');
      }
    } else if (isKeyM) {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMicrophone();
    } else if (isKeyW) {
      e.preventDefault();
      e.stopPropagation();
      this.toggleWebcam();
    }
  }

  /**
   * Handles draggable repositioning of the Webcam PiP container.
   */
  setupPipDragging() {
    const pip = this.webcamPipContainer;
    const stage = this.stageWrapper;

    const onMouseDown = (e) => {
      if (e.target.closest('.pip-tool-btn')) return; // Ignore buttons
      this.isDraggingPip = true;
      const rect = pip.getBoundingClientRect();
      this.pipDragOffset.x = e.clientX - rect.left;
      this.pipDragOffset.y = e.clientY - rect.top;
      pip.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.isDraggingPip) return;

      const stageRect = stage.getBoundingClientRect();
      let left = e.clientX - stageRect.left - this.pipDragOffset.x;
      let top = e.clientY - stageRect.top - this.pipDragOffset.y;

      const maxLeft = stageRect.width - pip.offsetWidth - 10;
      const maxTop = stageRect.height - pip.offsetHeight - 10;

      left = Math.max(10, Math.min(maxLeft, left));
      top = Math.max(10, Math.min(maxTop, top));

      pip.style.left = `${left}px`;
      pip.style.top = `${top}px`;
      pip.style.bottom = 'auto';
      pip.style.right = 'auto';

      this.syncPipPositionToCompositor();
    };

    const onMouseUp = () => {
      if (this.isDraggingPip) {
        this.isDraggingPip = false;
        pip.style.cursor = 'grab';
      }
    };

    pip.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Touch support for mobile / tablets
    pip.addEventListener('touchstart', (e) => {
      if (e.target.closest('.pip-tool-btn')) return;
      this.isDraggingPip = true;
      const touch = e.touches[0];
      const rect = pip.getBoundingClientRect();
      this.pipDragOffset.x = touch.clientX - rect.left;
      this.pipDragOffset.y = touch.clientY - rect.top;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDraggingPip) return;
      const touch = e.touches[0];
      const stageRect = stage.getBoundingClientRect();
      let left = touch.clientX - stageRect.left - this.pipDragOffset.x;
      let top = touch.clientY - stageRect.top - this.pipDragOffset.y;

      const maxLeft = stageRect.width - pip.offsetWidth - 10;
      const maxTop = stageRect.height - pip.offsetHeight - 10;

      left = Math.max(10, Math.min(maxLeft, left));
      top = Math.max(10, Math.min(maxTop, top));

      pip.style.left = `${left}px`;
      pip.style.top = `${top}px`;
      pip.style.bottom = 'auto';
      pip.style.right = 'auto';

      this.syncPipPositionToCompositor();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDraggingPip = false;
    });
  }

  /**
   * Prompts user for Screen Selection using getDisplayMedia.
   */
  async requestScreenCapture() {
    try {
      // Clean up previous screen tracks if any
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(t => t.stop());
        this.screenStream = null;
      }

      const { width, height } = this.parseResolution(this.settings.resolution);
      const displayConstraints = {
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: this.settings.fps, max: 60 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      if (this.settings.resolution !== 'native') {
        displayConstraints.video.width = { ideal: width, max: width };
        displayConstraints.video.height = { ideal: height, max: height };
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      this.screenStream = stream;

      // Check system audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.mixer.setSystemStream(stream);
        this.showToast('System Audio Detected', 'Tab or system audio is connected to the studio mixer.', 'info');
      } else {
        this.mixer.setSystemStream(null);
      }

      // Handle user stopping screen share from native browser floating bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // Optimize for razor-sharp text, code, and UI details
        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = 'text';
        }
        videoTrack.onended = () => {
          this.handleScreenShareEnded();
        };
      }

      // Set to screen video element
      this.screenVideo.srcObject = stream;
      this.screenVideo.classList.add('active');
      this.stageEmptyState.style.display = 'none';
      this.dockScreenLabel.textContent = 'Change Screen';
      this.btnDockSelectScreen.classList.add('active');

      this.recorder.setState('screen_selected');
      this.showToast('Screen Selected', 'Screen capture source is active and ready for recording.', 'success');

      // If compositor mode is active, refresh compositor
      if (this.isCompositorMode) {
        this.startCompositorStream();
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        this.showToast('Permission Denied', 'Screen capture permission was cancelled or denied.', 'warning');
      } else {
        this.showToast('Screen Capture Failed', err.message || 'Unable to access display media.', 'error');
      }
      console.warn('Screen capture request error:', err);
    }
  }

  /**
   * Called when the screen share track ends externally.
   */
  handleScreenShareEnded() {
    this.showToast('Screen Share Stopped', 'The shared screen was ended through browser controls.', 'info');

    // If currently recording, safely finalize recording
    if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
      this.stopRecordingSession();
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    this.mixer.setSystemStream(null);
    this.screenVideo.srcObject = null;
    this.screenVideo.classList.remove('active');
    this.stageEmptyState.style.display = 'flex';
    this.dockScreenLabel.textContent = 'Screen';
    this.btnDockSelectScreen.classList.remove('active');

    if (this.isCompositorMode) {
      this.compositor.stop();
      this.compositorCanvas.classList.remove('active');
    }

    this.recorder.setState('idle');
  }

  /**
   * Synchronizes current DOM PiP container position and scale to canvas compositor.
   */
  syncPipPositionToCompositor() {
    if (!this.webcamPipContainer || !this.stageWrapper || !this.compositor) return;
    const stageRect = this.stageWrapper.getBoundingClientRect();
    const pipRect = this.webcamPipContainer.getBoundingClientRect();

    if (stageRect.width > 0 && stageRect.height > 0) {
      const normX = (pipRect.left - stageRect.left) / stageRect.width;
      const normY = (pipRect.top - stageRect.top) / stageRect.height;
      const scale = pipRect.width / stageRect.width;

      this.compositor.updateOverlayPosition(normX, normY);
      this.compositor.setOverlayConfig({
        isEnabled: this.isWebcamActive,
        shape: this.settings.pipShape,
        isMirrored: this.settings.pipMirrored,
        scale: scale > 0.05 ? scale : this.settings.pipScale
      });
    }
  }

  /**
   * Toggles microphone input cleanly on and off.
   */
  async toggleMicrophone() {
    if (this.isMicActive) {
      // Turn off microphone
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      this.mixer.setMicStream(null);
      this.visualizer.stop();
      this.hudAudioMeter.classList.remove('visible');
      this.isMicActive = false;

      this.btnDockMic.classList.remove('active');
      this.dockMicLabel.textContent = 'Mic Off';
      this.micVolumePopover.classList.remove('open');
      this.showToast('Microphone Disabled', 'Microphone audio input has been muted.', 'info');
    } else {
      // Request microphone
      try {
        const audioConstraints = {
          echoCancellation: this.settings.echoCancellation,
          noiseSuppression: this.settings.noiseSuppression,
          autoGainControl: true
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        this.micStream = stream;

        // Configure mixer and visualizer
        this.mixer.setMicStream(stream);
        this.mixer.setMicVolume(this.settings.micGain);
        this.visualizer.start(this.mixer);

        this.hudAudioMeter.classList.add('visible');
        this.isMicActive = true;

        this.btnDockMic.classList.add('active');
        this.dockMicLabel.textContent = 'Mic On';
        this.showToast('Microphone Enabled', 'Microphone is active and routed through the studio mixer.', 'success');
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          this.showToast('Microphone Denied', 'Microphone access was denied.', 'warning');
        } else {
          this.showToast('Microphone Error', err.message || 'Could not connect to microphone.', 'error');
        }
      }
    }
  }

  /**
   * Toggles webcam picture-in-picture overlay.
   */
  async toggleWebcam(forceState = null) {
    const shouldEnable = forceState !== null ? forceState : !this.isWebcamActive;

    if (!shouldEnable) {
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(t => t.stop());
        this.webcamStream = null;
      }
      this.webcamVideo.srcObject = null;
      this.webcamPipContainer.style.display = 'none';
      this.btnDockWebcam.classList.remove('active');
      this.dockWebcamLabel.textContent = 'Cam Off';
      this.isWebcamActive = false;

      this.compositor.setOverlayConfig({ isEnabled: false });
      this.showToast('Webcam Disabled', 'Webcam overlay has been removed.', 'info');
    } else {
      try {
        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.webcamStream = stream;
        this.webcamVideo.srcObject = stream;
        await this.webcamVideo.play().catch(() => {});
        this.webcamPipContainer.style.display = 'block';

        this.btnDockWebcam.classList.add('active');
        this.dockWebcamLabel.textContent = 'Cam On';
        this.isWebcamActive = true;

        // Apply PiP styling and sync coordinates
        this.applyPipStyling();
        this.syncPipPositionToCompositor();

        // Connect webcam video to compositor and enable studio mix mode automatically
        this.compositor.webcamVideo = this.webcamVideo;
        this.isCompositorMode = true;
        this.btnDockCompositor.classList.add('active');
        this.dockCompositorLabel.textContent = 'Studio Mix';

        if (this.screenStream) {
          this.startCompositorStream();
        }

        this.showToast('Webcam Enabled', 'Camera is active and will be recorded into the video.', 'success');
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          this.showToast('Webcam Denied', 'Camera permission was denied.', 'warning');
        } else {
          this.showToast('Webcam Error', err.message || 'Could not access camera.', 'error');
        }
      }
    }
  }

  /**
   * Toggles webcam PiP shape (circle vs rectangle).
   */
  togglePipShape() {
    this.settings.pipShape = this.settings.pipShape === 'circle' ? 'rect' : 'circle';
    this.applyPipStyling();
    this.syncPipPositionToCompositor();
  }

  /**
   * Toggles webcam mirror reflection.
   */
  togglePipMirror() {
    this.settings.pipMirrored = !this.settings.pipMirrored;
    this.applyPipStyling();
    this.syncPipPositionToCompositor();
  }

  /**
   * Applies CSS classes according to PiP settings.
   */
  applyPipStyling() {
    if (this.settings.pipShape === 'circle') {
      this.webcamPipContainer.classList.add('circle-mode');
    } else {
      this.webcamPipContainer.classList.remove('circle-mode');
    }

    if (this.settings.pipMirrored) {
      this.webcamPipContainer.classList.add('mirrored');
    } else {
      this.webcamPipContainer.classList.remove('mirrored');
    }
  }

  /**
   * Toggles Studio Compositor mode (direct video stream vs canvas composite).
   */
  toggleCompositorMode() {
    this.isCompositorMode = !this.isCompositorMode;

    if (this.isCompositorMode) {
      this.btnDockCompositor.classList.add('active');
      this.dockCompositorLabel.textContent = 'Studio Mix';
      this.showToast('Studio Compositor Active', 'Webcam overlay will be baked directly into the recorded video file.', 'info');

      if (this.screenStream) {
        this.startCompositorStream();
      }
    } else {
      this.btnDockCompositor.classList.remove('active');
      this.dockCompositorLabel.textContent = 'Direct';
      this.compositor.stop();
      this.compositorCanvas.classList.remove('active');
      if (this.screenStream) {
        this.screenVideo.classList.add('active');
      }
      this.showToast('Direct Screen Mode', 'Recording directly captures the raw screen feed with maximum performance.', 'info');
    }
  }

  /**
   * Activates compositor canvas in the background while keeping screen preview visible.
   */
  startCompositorStream() {
    this.screenVideo.classList.add('active');
    const { width, height } = this.parseResolution(this.settings.resolution);
    this.compositor.setResolution(width, height, this.settings.fps);
    this.syncPipPositionToCompositor();
    this.compositor.start(this.screenVideo, this.webcamVideo, this.isWebcamActive);
  }

  /**
   * Starts recording session.
   */
  startRecordingSession() {
    if (!this.screenStream) {
      this.showToast('No Screen Selected', 'Please select a screen before starting recording.', 'warning');
      return;
    }

    try {
      let videoTrack = null;

      // Automatically use compositor stream if webcam is active or compositor mode is selected
      const needCompositor = this.isCompositorMode || this.isWebcamActive;

      if (needCompositor) {
        this.startCompositorStream();
        const canvasStream = this.compositor.compositedStream;
        videoTrack = canvasStream.getVideoTracks()[0];
      } else {
        videoTrack = this.screenStream.getVideoTracks()[0];
      }

      if (!videoTrack) {
        throw new Error('No active video track available for recording.');
      }

      // Assemble composite MediaStream with video track + mixed audio tracks
      const finalStream = new MediaStream();
      finalStream.addTrack(videoTrack);

      const mixedAudioTracks = this.mixer.getMixedAudioTracks();
      mixedAudioTracks.forEach(track => finalStream.addTrack(track));

      this.recorder.start(finalStream, {
        mimeType: this.settings.mimeType,
        videoBitsPerSecond: this.settings.bitrate
      });

      this.showToast('Recording Started', 'Studio is now recording your session.', 'success');
    } catch (err) {
      this.showToast('Failed to Start Recording', err.message || 'Unknown recording error', 'error');
      console.error('Start recording failed:', err);
    }
  }

  /**
   * Toggles pause / resume on active recording.
   */
  togglePauseRecording() {
    if (this.recorder.state === 'recording') {
      this.recorder.pause();
      this.showToast('Recording Paused', 'Elapsed timer paused.', 'warning');
    } else if (this.recorder.state === 'paused') {
      this.recorder.resume();
      this.showToast('Recording Resumed', 'Studio recording continued.', 'info');
    }
  }

  /**
   * Stops active recording and opens Review Modal.
   */
  async stopRecordingSession() {
    if (this.recorder.state !== 'recording' && this.recorder.state !== 'paused') {
      return;
    }

    try {
      const activeVideoElem = (this.isCompositorMode || this.isWebcamActive) ? this.compositor.canvas : this.screenVideo;
      const reviewData = await this.recorder.stop(activeVideoElem);
      this.compositor.stop();

      this.currentReviewData = reviewData;
      this.openReviewModal(reviewData);
      this.showToast('Recording Complete', `Captured ${reviewData.durationFormatted} (${reviewData.sizeFormatted}).`, 'success');
    } catch (err) {
      this.showToast('Failed to Stop Recording', err.message || 'Error compiling recording.', 'error');
      console.error('Stop recording failed:', err);
    }
  }

  /**
   * Captures still frame snapshot.
   */
  takeSnapshot() {
    const shouldUseCompositor = this.isCompositorMode || this.isWebcamActive;
    if (!this.screenStream) return;

    try {
      let snapshotData = null;
      if (shouldUseCompositor && this.compositor && this.compositor.canvas) {
        snapshotData = {
          dataUrl: this.compositor.canvas.toDataURL('image/png', 0.95),
          width: this.compositor.canvas.width,
          height: this.compositor.canvas.height
        };
      } else {
        snapshotData = ScreenRecorder.captureSnapshot(this.screenVideo, 'image/png');
      }

      this.downloadDataUrl(snapshotData.dataUrl, `studio-snapshot-${this.getTimestampString()}.png`);
      this.showToast('Snapshot Captured', `Saved ${snapshotData.width}×${snapshotData.height} still image.`, 'success');
    } catch (err) {
      this.showToast('Snapshot Failed', err.message || 'Could not capture snapshot frame.', 'error');
    }
  }

  /**
   * Opens Review Modal with generated recording Blob.
   */
  openReviewModal(reviewData) {
    if (this.currentReviewObjectUrl) {
      URL.revokeObjectURL(this.currentReviewObjectUrl);
    }

    this.currentReviewObjectUrl = URL.createObjectURL(reviewData.blob);
    this.reviewVideoPlayer.src = this.currentReviewObjectUrl;

    this.reviewMetaDuration.textContent = reviewData.durationFormatted;
    this.reviewMetaSize.textContent = reviewData.sizeFormatted;
    this.reviewMetaDimensions.textContent = `${reviewData.width} × ${reviewData.height}`;
    this.reviewMetaFormat.textContent = ScreenRecorder.formatCodecLabel(reviewData.mimeType);
    this.reviewMetaFormat.title = reviewData.mimeType;
    if (this.reviewMetaMimeSub) {
      this.reviewMetaMimeSub.textContent = reviewData.mimeType.split(';')[0];
      this.reviewMetaMimeSub.title = reviewData.mimeType;
    }

    this.btnSaveToLibrary.disabled = false;
    this.btnSaveToLibraryText.textContent = 'Save to Library';

    this.openModal(this.reviewModal);
  }

  /**
   * Closes Review Modal and pauses player.
   */
  closeReviewModal() {
    this.reviewVideoPlayer.pause();
    this.closeModal(this.reviewModal);
  }

  /**
   * Takes a still snapshot from the Review video player.
   */
  takeReviewSnapshot() {
    try {
      const snap = ScreenRecorder.captureSnapshot(this.reviewVideoPlayer, 'image/png');
      this.downloadDataUrl(snap.dataUrl, `review-snapshot-${this.getTimestampString()}.png`);
      this.showToast('Snapshot Captured', 'Review frame saved to device.', 'success');
    } catch (err) {
      this.showToast('Snapshot Failed', err.message, 'error');
    }
  }

  /**
   * Downloads current recording Blob.
   */
  downloadCurrentRecording() {
    if (!this.currentReviewData || !this.currentReviewData.blob) return;

    const ext = ScreenRecorder.getFileExtension(this.currentReviewData.mimeType);
    const filename = `Studio-Recording-${this.getTimestampString()}${ext}`;

    const url = URL.createObjectURL(this.currentReviewData.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast('Download Started', `Saving ${filename}`, 'info');
  }

  /**
   * Saves current recording to local IndexedDB.
   */
  async saveCurrentRecordingToLibrary() {
    if (!this.currentReviewData || !this.currentReviewData.blob) return;

    try {
      this.btnSaveToLibrary.disabled = true;
      this.btnSaveToLibraryText.textContent = 'Saving...';

      const record = {
        title: `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        duration: this.currentReviewData.duration,
        blob: this.currentReviewData.blob,
        mimeType: this.currentReviewData.mimeType,
        size: this.currentReviewData.size,
        width: this.currentReviewData.width,
        height: this.currentReviewData.height,
        thumbnail: this.currentReviewData.thumbnail
      };

      await storage.saveRecording(record);
      this.btnSaveToLibraryText.textContent = 'Saved!';
      this.showToast('Saved to Library', 'Recording saved locally to ScreenRecorderDB.', 'success');
      this.updateLibraryCountBadge();
    } catch (err) {
      this.btnSaveToLibrary.disabled = false;
      this.btnSaveToLibraryText.textContent = 'Save to Library';
      this.showToast('Storage Error', err.message || 'Failed to save recording to IndexedDB.', 'error');
    }
  }

  /**
   * Opens Recording Library Modal and renders cards.
   */
  async openLibraryModal() {
    this.openModal(this.libraryModal);
    this.renderLibraryGrid();
    this.updateStorageEstimate();
  }

  /**
   * Safely extracts or restores a thumbnail for a recording if missing.
   */
  async ensureRecordingThumbnail(rec, imgElem) {
    if (rec.thumbnail && rec.thumbnail.startsWith('data:image/jpeg') && rec.thumbnail.length > 25000) {
      imgElem.src = rec.thumbnail;
      return;
    }

    // Try extracting high-resolution crisp frame from video Blob
    if (rec.blob) {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const blobUrl = URL.createObjectURL(rec.blob);
        video.src = blobUrl;

        video.onloadeddata = () => {
          video.currentTime = Math.min(0.2, (rec.duration || 1) / 2);
        };

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            const targetW = Math.min(video.videoWidth || 720, 720);
            canvas.width = targetW;
            const aspect = (video.videoWidth && video.videoHeight) ? (video.videoWidth / video.videoHeight) : (16 / 9);
            canvas.height = Math.round(targetW / aspect);

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.92);
            imgElem.src = thumb;
            rec.thumbnail = thumb;
            storage.saveRecording(rec).catch(() => {});
          } catch (e) {}
          URL.revokeObjectURL(blobUrl);
        };

        video.onerror = () => {
          URL.revokeObjectURL(blobUrl);
        };
      } catch (e) {}
    }
  }

  /**
   * Fetches and renders all saved recordings in the library.
   */
  async renderLibraryGrid() {
    this.libraryGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted);">
        Loading recordings...
      </div>
    `;

    try {
      const recordings = await storage.getAllRecordings();

      if (recordings.length === 0) {
        this.libraryGrid.innerHTML = `
          <div class="empty-library">
            <svg class="empty-library-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <p>No saved recordings found in your local library.</p>
          </div>
        `;
        return;
      }

      this.libraryGrid.innerHTML = '';
      const fallbackThumb = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='320'%20height='180'%20viewBox='0%200%20320%20180'%3E%3Crect%20width='320'%20height='180'%20fill='%230f172a'/%3E%3Ccircle%20cx='160'%20cy='90'%20r='32'%20fill='%231e293b'/%3E%3Cpolygon%20points='154%2C76%20174%2C90%20154%2C104'%20fill='%236366f1'/%3E%3C/svg%3E";

      recordings.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'recording-card';

        const initialThumb = (rec.thumbnail && rec.thumbnail.startsWith('data:image/jpeg')) ? rec.thumbnail : fallbackThumb;
        const dateStr = new Date(rec.timestamp).toLocaleString();
        const durationFormatted = ScreenRecorder.formatSeconds(rec.duration || 0);
        const sizeFormatted = ScreenRecorder.formatFileSize(rec.size || 0);

        card.innerHTML = `
          <div class="card-thumbnail-box">
            <img class="card-thumbnail-img" alt="Thumbnail">
            <span class="card-duration-badge">${durationFormatted}</span>
          </div>
          <div class="card-content">
            <div class="card-title-row">
              <span class="card-title" title="${this.escapeHtml(rec.title)}">${this.escapeHtml(rec.title)}</span>
            </div>
            <span class="card-date">${dateStr}</span>
            <div class="card-meta-chips">
              <span class="meta-chip">${rec.width}×${rec.height}</span>
              <span class="meta-chip">${sizeFormatted}</span>
              <span class="meta-chip" title="${this.escapeHtml(rec.mimeType)}">${ScreenRecorder.formatCodecLabel(rec.mimeType)}</span>
            </div>
          </div>
          <div class="card-actions-row">
            <button class="btn btn-sm btn-secondary btn-card-play" title="Play Recording">Preview</button>
            <button class="btn btn-sm btn-secondary btn-card-rename" title="Rename Recording">Rename</button>
            <button class="btn btn-sm btn-primary btn-card-dl" title="Download Recording">Download</button>
            <button class="btn btn-sm btn-danger btn-card-del" title="Delete Recording">Delete</button>
          </div>
        `;

        const imgElem = card.querySelector('.card-thumbnail-img');
        imgElem.src = initialThumb;

        // If thumbnail was missing or placeholder, extract frame from Blob
        if (!rec.thumbnail || !rec.thumbnail.startsWith('data:image/jpeg')) {
          this.ensureRecordingThumbnail(rec, imgElem);
        }

        // Card button actions
        card.querySelector('.btn-card-play').addEventListener('click', () => {
          this.previewLibraryRecording(rec);
        });

        card.querySelector('.btn-card-rename').addEventListener('click', () => {
          this.renameLibraryRecording(rec);
        });

        card.querySelector('.btn-card-dl').addEventListener('click', () => {
          this.downloadLibraryRecording(rec);
        });

        card.querySelector('.btn-card-del').addEventListener('click', () => {
          this.deleteLibraryRecording(rec);
        });

        this.libraryGrid.appendChild(card);
      });
    } catch (err) {
      this.libraryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; color: #ef4444; padding: 20px;">
          Failed to load recordings: ${err.message}
        </div>
      `;
    }
  }

  /**
   * Previews a recording from library in review modal.
   */
  previewLibraryRecording(rec) {
    this.closeModal(this.libraryModal);
    this.currentReviewData = {
      blob: rec.blob,
      duration: rec.duration,
      durationFormatted: ScreenRecorder.formatSeconds(rec.duration),
      size: rec.size,
      sizeFormatted: ScreenRecorder.formatFileSize(rec.size),
      width: rec.width,
      height: rec.height,
      mimeType: rec.mimeType,
      thumbnail: rec.thumbnail
    };
    this.openReviewModal(this.currentReviewData);
    this.btnSaveToLibrary.disabled = true;
    this.btnSaveToLibraryText.textContent = 'Already in Library';
  }

  /**
   * Prompts user to rename a saved recording.
   */
  async renameLibraryRecording(rec) {
    const newTitle = prompt('Enter a new title for this recording:', rec.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== rec.title) {
      try {
        await storage.updateRecordingTitle(rec.id, newTitle.trim());
        this.showToast('Renamed', 'Recording title updated successfully.', 'success');
        this.renderLibraryGrid();
      } catch (err) {
        this.showToast('Rename Failed', err.message, 'error');
      }
    }
  }

  /**
   * Downloads recording from library.
   */
  downloadLibraryRecording(rec) {
    const ext = ScreenRecorder.getFileExtension(rec.mimeType);
    const sanitizedTitle = (rec.title || 'recording').replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${sanitizedTitle}${ext}`;

    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast('Download Started', `Downloading ${filename}`, 'info');
  }

  /**
   * Deletes a recording from library with confirmation.
   */
  async deleteLibraryRecording(rec) {
    if (confirm(`Are you sure you want to delete "${rec.title}"? This cannot be undone.`)) {
      try {
        await storage.deleteRecording(rec.id);
        this.showToast('Deleted', 'Recording removed from library.', 'info');
        this.renderLibraryGrid();
        this.updateLibraryCountBadge();
        this.updateStorageEstimate();
      } catch (err) {
        this.showToast('Delete Failed', err.message, 'error');
      }
    }
  }

  /**
   * Updates total recording count in the header badge.
   */
  async updateLibraryCountBadge() {
    try {
      const recordings = await storage.getAllRecordings();
      this.libraryCountBadge.textContent = String(recordings.length);
    } catch (e) {
      this.libraryCountBadge.textContent = '0';
    }
  }

  /**
   * Updates storage estimate readout.
   */
  async updateStorageEstimate() {
    const est = await storage.getStorageEstimate();
    this.libraryStorageEstimate.textContent = `Storage Used: ${est.usageFormatted} of ${est.quotaFormatted} (${est.percent}%)`;
  }

  /**
   * Saves settings modal form.
   */
  handleSaveSettings() {
    this.settings.resolution = this.settingResolution.value;
    this.settings.fps = parseInt(this.settingFps.value, 10);
    this.settings.bitrate = parseInt(this.settingBitrate.value, 10);
    this.settings.mimeType = this.settingFormat.value;
    this.settings.echoCancellation = this.settingEchoCancellation.checked;
    this.settings.noiseSuppression = this.settingNoiseSuppression.checked;
    this.settings.pipShape = this.settingPipShape.value;

    const scaleVal = this.settingPipSize.value;
    this.settings.pipScale = scaleVal === 'small' ? 0.16 : scaleVal === 'large' ? 0.30 : 0.22;

    this.saveSettings();
    this.updateStreamSpecBadge();
    this.applyPipStyling();

    // Reconfigure compositor
    const { width, height } = this.parseResolution(this.settings.resolution);
    this.compositor.setResolution(width, height, this.settings.fps);
    this.compositor.setOverlayConfig({
      shape: this.settings.pipShape,
      scale: this.settings.pipScale
    });

    this.closeModal(this.settingsModal);
  }

  /**
   * Resets settings to defaults.
   */
  handleResetSettings() {
    this.settings = {
      resolution: '1920x1080',
      fps: 30,
      bitrate: 8000000,
      mimeType: ScreenRecorder.getSupportedMimeTypes()[0] || '',
      echoCancellation: true,
      noiseSuppression: true,
      micGain: 1.0,
      systemGain: 1.0,
      pipShape: 'rect',
      pipScale: 0.22,
      pipMirrored: false
    };

    this.saveSettings();
    this.applySettingsToUi();
    this.showToast('Settings Reset', 'Restored default audio, video, and layout settings.', 'info');
  }

  /**
   * Helper to open any modal.
   */
  openModal(modalElem) {
    modalElem.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Helper to close any modal.
   */
  closeModal(modalElem) {
    modalElem.classList.remove('open');
    document.body.style.overflow = '';
  }

  /**
   * Displays non-blocking accessible toast notification.
   */
  showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-content">
        <span class="toast-title">${this.escapeHtml(title)}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
      </div>
      <button class="toast-close" aria-label="Close Notification">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    this.toastContainer.appendChild(toast);

    // Auto dismiss after 4.5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 4500);
  }

  /**
   * Helper to download a data URL.
   */
  downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Generates formatted timestamp string YYYY-MM-DD-HHmmss.
   */
  getTimestampString() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  /**
   * Escapes HTML strings to prevent XSS.
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new StudioApp();
  app.init().catch(err => {
    console.error('Studio initialization error:', err);
  });
});
