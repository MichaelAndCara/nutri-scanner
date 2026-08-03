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

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="camera-card">
      <div class="viewfinder">
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

        @if (state().status === 'analyzing') {
          <div class="analyzing-state">
            <div class="spinner"></div>
            <p class="ocr-msg">{{ ocrMessage() }}</p>
            <div class="ocr-track"><div class="ocr-bar" [style.width.%]="ocrProgress()"></div></div>
          </div>
        }

        @if (state().status === 'error') {
          <div class="error-state">
            <span>⚠️</span>
            <p>{{ state().error }}</p>
          </div>
        }
      </div>

      <div class="cam-controls">
        @if (!cameraActive() && state().status !== 'analyzing') {
          <button class="btn-p" (click)="startCamera()">📷 Open Camera</button>
          <label class="btn-s">
            🖼️ Upload Photo
            <input type="file" accept="image/*" style="display:none" (change)="onFileUpload($event)">
          </label>
        }
        @if (cameraActive()) {
          <button class="btn-capture" (click)="capture()">
            <span class="cap-ring"></span><span class="cap-dot"></span>
          </button>
          <button class="btn-s" (click)="stopCamera()">Cancel</button>
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
  ocrMessage = signal(OCR_STAGES[0].msg);
  ocrProgress = signal(0);

  private stream: MediaStream | null = null;
  private stageTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private aiService: NutritionAiService) { }

  async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }
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

  capture(): void {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    // Sharpen before handing to OCR: boost contrast + apply an unsharp-mask-style filter
    ctx.filter = 'contrast(1.4) brightness(1.05) saturate(0)'; // greyscale + contrast lift
    ctx.drawImage(video, 0, 0);
    ctx.filter = 'none';

    // Second pass: convolution sharpen kernel via ImageData
    this.sharpenCanvas(ctx, canvas.width, canvas.height);

    // PNG preserves every pixel; better than JPEG for text OCR
    const dataUrl = canvas.toDataURL('image/png');
    this.stopCamera();
    this.analyze(dataUrl);

    //   canvas.getContext('2d')!.drawImage(video, 0, 0);
    //   const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    //   this.stopCamera();
    //   this.analyze(dataUrl);
    // }
  }

  /**
  * Applies a 3×3 unsharp-mask convolution directly to the pixel data.
  * Noticeably improves Tesseract accuracy on curved / low-contrast labels.
  */
  private sharpenCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const imageData = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;

    // Sharpening kernel  (centre weight 5, cardinal neighbours -1)
    //  [ 0  -1   0 ]
    //  [-1   5  -1 ]
    //  [ 0  -1   0 ]
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const t = ((y - 1) * w + x) * 4;
        const b = ((y + 1) * w + x) * 4;
        const l = (y * w + (x - 1)) * 4;
        const r = (y * w + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          dst[i + c] = Math.min(255, Math.max(0,
            5 * src[i + c]
            - src[t + c] - src[b + c]
            - src[l + c] - src[r + c]
          ));
        }
        dst[i + 3] = 255; // alpha
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  async onFileUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.analyze(e.target!.result as string);
    reader.readAsDataURL(file);
  }

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
    } catch (err) {
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

  stopCamera(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.cameraActive.set(false);
    this.state.set({ status: 'idle' });
  }

  reset(): void { this.state.set({ status: 'idle' }); }

  ngOnDestroy(): void {
    this.stopCamera();
    this.stopStages();
    this.aiService.destroy();
  }
}
