import {
  Component, ElementRef, ViewChild, Output, EventEmitter,
  OnDestroy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionAiService } from '../../services/nutrition-ai.service';
import { NutritionResult, ScanState } from '../../models/nutrition.model';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="camera-card">
      <div class="viewfinder" [class.active]="state().status === 'capturing'">
        @if (state().status === 'idle' || state().status === 'capturing') {
          <video
            #videoEl
            class="video-feed"
            autoplay
            playsinline
            muted
            [class.visible]="cameraActive()"
          ></video>
          <canvas #canvasEl class="capture-canvas"></canvas>

          @if (!cameraActive()) {
            <div class="camera-placeholder">
              <div class="placeholder-icon">📸</div>
              <p>Tap below to open camera</p>
            </div>
          }

          @if (cameraActive()) {
            <div class="scan-overlay">
              <div class="scan-frame">
                <span class="corner tl"></span>
                <span class="corner tr"></span>
                <span class="corner bl"></span>
                <span class="corner br"></span>
              </div>
              <p class="scan-hint">Align nutrition label within frame</p>
            </div>
          }
        }

        @if (state().status === 'analyzing') {
          <div class="analyzing-state">
            <div class="spinner"></div>
            <p>{{ ocrMessage() }}</p>
            <div class="ocr-progress">
              <div class="ocr-bar" [style.width.%]="ocrProgress()"></div>
            </div>
          </div>
        }

        @if (state().status === 'error') {
          <div class="error-state">
            <span class="error-icon">⚠️</span>
            <p>{{ state().error }}</p>
          </div>
        }
      </div>

      <div class="camera-controls">
        @if (!cameraActive() && state().status !== 'analyzing') {
          <button class="btn-primary" (click)="startCamera()">
            <span class="btn-icon">📷</span>
            Open Camera
          </button>
          <label class="btn-secondary">
            <span class="btn-icon">🖼️</span>
            Upload Photo
            <input
              type="file"
              accept="image/*"
              style="display:none"
              (change)="onFileUpload($event)"
            >
          </label>
        }

        @if (cameraActive()) {
          <button class="btn-capture" (click)="capture()">
            <span class="capture-ring"></span>
            <span class="capture-dot"></span>
          </button>
          <button class="btn-secondary" (click)="stopCamera()">Cancel</button>
        }

        @if (state().status === 'error') {
          <button class="btn-primary" (click)="reset()">Try Again</button>
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
  ocrMessage = signal('Initializing OCR engine...');
  ocrProgress = signal(0);

  private stream: MediaStream | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private aiService: NutritionAiService) {}

  async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
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
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.stopCamera();
    this.analyze(dataUrl);
  }

  async onFileUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.analyze(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  private async analyze(dataUrl: string): Promise<void> {
    this.state.set({ status: 'analyzing' });
    this.startProgressAnimation();
    try {
      const result = await this.aiService.analyzeImage(dataUrl);
      this.stopProgressAnimation();
      this.ocrProgress.set(100);
      this.ocrMessage.set('Done!');
      setTimeout(() => {
        this.state.set({ status: 'done' });
        this.imageCaptured.emit(result);
        this.state.set({ status: 'idle' });
        this.ocrProgress.set(0);
      }, 300);
    } catch {
      this.stopProgressAnimation();
      this.state.set({ status: 'error', error: 'Could not read label. Try better lighting or a clearer photo.' });
    }
  }

  private startProgressAnimation(): void {
    const stages = [
      { pct: 15, msg: 'Initializing OCR engine...' },
      { pct: 35, msg: 'Loading language model...' },
      { pct: 55, msg: 'Scanning label text...' },
      { pct: 75, msg: 'Extracting nutrition data...' },
      { pct: 90, msg: 'Parsing values...' },
    ];
    let i = 0;
    this.ocrMessage.set(stages[0].msg);
    this.ocrProgress.set(stages[0].pct);
    this.progressTimer = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      this.ocrMessage.set(stages[i].msg);
      this.ocrProgress.set(stages[i].pct);
    }, 1400);
  }

  private stopProgressAnimation(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  stopCamera(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.cameraActive.set(false);
    this.state.set({ status: 'idle' });
  }

  reset(): void {
    this.state.set({ status: 'idle' });
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.stopProgressAnimation();
    this.aiService.destroy();
  }
}
