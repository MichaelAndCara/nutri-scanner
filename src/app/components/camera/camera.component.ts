import {
  Component, ElementRef, ViewChild, Output, EventEmitter,
  OnDestroy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionAiService } from '../../services/nutrition-ai.service';
import { NutritionResult, ScanState } from '../../models/nutrition.model';

const OCR_STAGES = [
  { pct: 12, msg: 'Initializing OCR engine…' },
  { pct: 30, msg: 'Loading language model…' },
  { pct: 52, msg: 'Scanning label text…' },
  { pct: 72, msg: 'Extracting nutrients…' },
  { pct: 88, msg: 'Parsing values…' },
];

// How long to wait after the shutter tap for autofocus to settle (ms)
const FOCUS_SETTLE_MS = 1200;

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="camera-card">
      <div class="viewfinder">

        <!-- Live viewfinder -->
        @if (state().status === 'idle' || state().status === 'capturing') {
          <video #videoEl class="video-feed" autoplay playsinline muted
                 [class.visible]="cameraActive()"></video>
          <canvas #canvasEl class="capture-canvas"></canvas>

          @if (!cameraActive()) {
            <div class="camera-placeholder">
              <div class="ph-icon">📸</div>
              <p>Tap below to open camera</p>
            </div>
          } @else {
            <div class="scan-overlay">
              <div class="scan-frame">
                <span class="c tl"></span><span class="c tr"></span>
                <span class="c bl"></span><span class="c br"></span>
              </div>
              <p class="scan-hint">Align nutrition label within frame</p>
            </div>
          }
        }

        <!-- Freeze-frame preview — user approves or retakes -->
        @if (state().status === 'preview') {
          <div class="preview-wrap">
            <img [src]="previewUrl()" class="preview-img" alt="Captured frame" />
            <div class="preview-badge">Check sharpness — retake if blurry</div>
          </div>
        }

        <!-- Focusing countdown -->
        @if (focusing()) {
          <div class="focusing-state">
            <div class="focus-ring"></div>
            <p>Focusing…</p>
          </div>
        }

        <!-- OCR in progress -->
        @if (state().status === 'analyzing') {
          <div class="analyzing-state">
            <div class="spinner"></div>
            <p class="ocr-msg">{{ ocrMessage() }}</p>
            <div class="ocr-track"><div class="ocr-bar" [style.width.%]="ocrProgress()"></div></div>
          </div>
        }

        <!-- Error -->
        @if (state().status === 'error') {
          <div class="error-state">
            <span>⚠️</span>
            <p>{{ state().error }}</p>
          </div>
        }
      </div>

      <!-- Controls -->
      <div class="cam-controls">
        @if (!cameraActive() && state().status !== 'analyzing' && state().status !== 'preview') {
          <button class="btn-p" (click)="startCamera()">📷 Open Camera</button>
          <label class="btn-s">
            🖼️ Upload Photo
            <input type="file" accept="image/*" style="display:none" (change)="onFileUpload($event)">
          </label>
        }
        @if (cameraActive() && !focusing()) {
          <button class="btn-capture" (click)="capture()">
            <span class="cap-ring"></span><span class="cap-dot"></span>
          </button>
          <button class="btn-s" (click)="stopCamera()">Cancel</button>
        }

        @if (state().status === 'preview') {
          <button class="btn-p" (click)="confirmPreview()">✓ Use This Photo</button>
          <button class="btn-s" (click)="retake()">↺ Retake</button>
        }

        @if (state().status === 'error') {
          <button class="btn-p" (click)="reset()">Try Again</button>
        }
      </div>
    </div>
  `,
  styleUrl: './camera.component.scss'
})
export class CameraComponent implements OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;
  @Output() imageCaptured = new EventEmitter<NutritionResult>();

  state = signal<ScanState>({ status: 'idle' });
  cameraActive = signal(false);
  focusing = signal(false);
  previewUrl = signal<string>('');
  ocrMessage = signal(OCR_STAGES[0].msg);
  ocrProgress = signal(0);

  private stream: MediaStream | null = null;
  private stageTimer: ReturnType<typeof setInterval> | null = null;
  private pendingUrl: string = '';   // captured dataUrl waiting for user approval

  constructor(private aiService: NutritionAiService) { }

  async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }
        video: ({
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          focusMode: { ideal: 'continuous' },
          whiteBalanceMode: { ideal: 'continuous' },
          exposureMode: { ideal: 'continuous' },
        } as any)
      });
      this.state.set({ status: 'capturing' });
      setTimeout(() => {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.cameraActive.set(true);
      }, 50);
    } catch {
      this.state.set({ status: 'error', error: 'Camera access denied. Please allow camera permissions.' });
    }
  }

  // capture(): void {
  //   const video = this.videoEl.nativeElement;
  //   const canvas = this.canvasEl.nativeElement;
  //   canvas.width = video.videoWidth;
  //   canvas.height = video.videoHeight;

  //   const ctx = canvas.getContext('2d')!;
  //   // Sharpen before handing to OCR: boost contrast + apply an unsharp-mask-style filter
  //   ctx.filter = 'contrast(1.4) brightness(1.05) saturate(0)'; // greyscale + contrast lift
  //   ctx.drawImage(video, 0, 0);
  //   ctx.filter = 'none';

  //   // Second pass: convolution sharpen kernel via ImageData
  //   this.sharpenCanvas(ctx, canvas.width, canvas.height);

  //   // PNG preserves every pixel; better than JPEG for text OCR
  //   const dataUrl = canvas.toDataURL('image/png');
  //   this.stopCamera();
  //   this.analyze(dataUrl);

  //   //   canvas.getContext('2d')!.drawImage(video, 0, 0);
  //   //   const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  //   //   this.stopCamera();
  //   //   this.analyze(dataUrl);
  //   // }
  // }

  async capture(): Promise<void> {
    // Show focus indicator, wait for autofocus to settle
    this.focusing.set(true);
    await this.delay(FOCUS_SETTLE_MS);
    this.focusing.set(false);

    const dataUrl = await this.grabBestFrame();
    this.pendingUrl = dataUrl;
    this.previewUrl.set(dataUrl);

    // Stop the live feed and show the freeze-frame for review
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.cameraActive.set(false);
    this.state.set({ status: 'preview' });
  }

  confirmPreview(): void {
    this.analyze(this.pendingUrl);
  }

  retake(): void {
    this.pendingUrl = '';
    this.previewUrl.set('');
    this.state.set({ status: 'idle' });
    this.startCamera();
  }

  stopCamera(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.cameraActive.set(false);
    this.focusing.set(false);
    this.state.set({ status: 'idle' });
  }

  reset(): void { this.state.set({ status: 'idle' }); }

  // ---------------------------------------------------------------------------
  // Frame capture — prefers ImageCapture API (full sensor res) over canvas grab
  // ---------------------------------------------------------------------------

  private async grabBestFrame(): Promise<string> {
    // ImageCapture gives the real full-resolution sensor photo, not the
    // downsampled video stream — dramatically better for OCR on curved labels.
    if ('ImageCapture' in window && this.stream) {
      try {
        const track = this.stream.getVideoTracks()[0];
        const imageCapture = new (window as any).ImageCapture(track);
        const blob: Blob = await imageCapture.takePhoto({
          imageWidth: 3840,
          imageHeight: 2160,
        });
        const dataUrl = await this.blobToDataUrl(blob);
        return this.processImage(dataUrl);
      } catch {
        // ImageCapture failed — fall through to canvas grab
      }
    }

    // Fallback: draw the current video frame to canvas
    return this.grabFromCanvas();
  }

  private grabFromCanvas(): string {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'contrast(1.4) brightness(1.05) saturate(0)';
    ctx.drawImage(video, 0, 0);
    ctx.filter = 'none';
    this.sharpenCanvas(ctx, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
  }

  /**
   * Applies greyscale + contrast lift + sharpening kernel to an image dataUrl.
   * Used for the ImageCapture path (blobs arrive as colour JPEG from the sensor).
   */
  private processImage(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = this.canvasEl.nativeElement;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;

        ctx.filter = 'contrast(1.4) brightness(1.05) saturate(0)';
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';
        this.sharpenCanvas(ctx, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------

  async onFileUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.analyze(e.target!.result as string);
    reader.readAsDataURL(file);
  }

  // ---------------------------------------------------------------------------
  // OCR pipeline
  // ---------------------------------------------------------------------------

  private async analyze(dataUrl: string): Promise<void> {
    this.state.set({ status: 'analyzing' });
    this.startStages();
    try {
      const result = await this.aiService.analyzeImage(dataUrl);
      this.stopStages();
      this.ocrProgress.set(100);
      this.ocrMessage.set('Done!');
      setTimeout(() => {
        this.imageCaptured.emit(result);
        this.state.set({ status: 'idle' });
        this.ocrProgress.set(0);
      }, 300);
    } catch {
      this.stopStages();
      this.state.set({ status: 'error', error: 'Could not read label. Try better lighting or a clearer photo.' });
    }
  }

  private startStages(): void {
    let i = 0;
    this.ocrMessage.set(OCR_STAGES[0].msg);
    this.ocrProgress.set(OCR_STAGES[0].pct);
    this.stageTimer = setInterval(() => {
      i = Math.min(i + 1, OCR_STAGES.length - 1);
      this.ocrMessage.set(OCR_STAGES[i].msg);
      this.ocrProgress.set(OCR_STAGES[i].pct);
    }, 1400);
  }

  private stopStages(): void {
    if (this.stageTimer) { clearInterval(this.stageTimer); this.stageTimer = null; }
  }

  // ---------------------------------------------------------------------------
  // Image processing helpers
  // ---------------------------------------------------------------------------

  private sharpenCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const imageData = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const t = ((y - 1) * w + x) * 4;
        const b = ((y + 1) * w + x) * 4;
        const l = (y * w + (x - 1)) * 4;
        const r = (y * w + (x + 1)) * 4;
        for (let c = 0; c < 3; c++) {
          dst[i + c] = Math.min(255, Math.max(0,
            5 * src[i + c] - src[t + c] - src[b + c] - src[l + c] - src[r + c]
          ));
        }
        dst[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------

  ngOnDestroy(): void {
    this.stopCamera();
    this.stopStages();
    this.aiService.destroy();
  }
}
