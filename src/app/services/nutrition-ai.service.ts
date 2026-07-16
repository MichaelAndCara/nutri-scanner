import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import { NutritionResult } from '../models/nutrition.model';

// ---------------------------------------------------------------------------
// All paths point to files bundled inside the Angular app under /public/.
// No CDN or external network request is made at runtime.
//
//   public/tesseract/worker.min.js          — Tesseract worker script
//   public/tesseract/tesseract-core-simd.wasm.js — WASM core (SIMD build)
//   public/tessdata/eng.traineddata.gz      — English trained model (~11 MB)
// ---------------------------------------------------------------------------
const LOCAL_WORKER_PATH = '/tesseract/worker.min.js';
const LOCAL_CORE_PATH = '/tesseract/tesseract-core-simd.wasm.js';
const LOCAL_LANG_PATH = '/tessdata';   // tesseract.js appends /eng.traineddata.gz

@Injectable({ providedIn: 'root' })
export class NutritionAiService {
  private worker: Worker | null = null;

  /**
   * Lazily initialise the Tesseract worker.
   * All asset paths resolve to files served from the Angular app itself —
   * no external network calls are ever made.
   */
  private async getWorker(): Promise<Worker> {
    if (this.worker) return this.worker;

    this.worker = await createWorker('eng', 1, {
      workerPath: LOCAL_WORKER_PATH,
      corePath: LOCAL_CORE_PATH,
      langPath: LOCAL_LANG_PATH,
      // Disable all logging in production; flip to console.log for debugging
      logger: () => { /* silent */ },
    });

    return this.worker;
  }

  async analyzeImage(imageDataUrl: string): Promise<NutritionResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(imageDataUrl);

    const rawText = data.text;
    const ocrConfidence = data.confidence; // 0–100

    const confidence: 'high' | 'medium' | 'low' =
      ocrConfidence >= 70 ? 'high' :
        ocrConfidence >= 40 ? 'medium' : 'low';

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      imageDataUrl,
      productName: this.parseProductName(rawText),
      servingSize: this.parseServingSize(rawText),
      servingsPerContainer: this.parseServingsPerContainer(rawText),
      calories: this.parseCalories(rawText),
      fat: this.parseFat(rawText),
      fiber: this.parseFiber(rawText),
      rawText,
      confidence,
    };
  }

  // -------------------------------------------------------------------------
  // Parsers
  // -------------------------------------------------------------------------

  private parseCalories(text: string): number {
    const m = text.match(/calories\s*\n?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  private parseFat(text: string): number {
    const m = text.match(/total\s*fat\s+([\d.]+)\s*g/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  private parseFiber(text: string): number {
    const m = text.match(/dietary\s*fiber\s+([\d.]+)\s*g/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  private parseServingSize(text: string): string {
    const m = text.match(/serving\s*size\s*[:\-]?\s*([^\n]{3,40})/i);
    return m ? m[1].trim() : 'Unknown';
  }

  private parseServingsPerContainer(text: string): number | undefined {
    const m = text.match(/(?:about\s+)?([\d.]+)\s*servings?\s*per\s*container/i);
    return m ? parseFloat(m[1]) : undefined;
  }

  private parseProductName(text: string): string {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/nutrition\s*facts/i.test(line)) continue;
      if (/serving|calories|amount|daily\s*value/i.test(line)) continue;
      if (/^\d/.test(line)) continue;
      if (line.length >= 4 && line.length <= 60) return line;
    }
    return 'Nutrition Facts';
  }

  /** Call this from the component's ngOnDestroy to free the WASM worker. */
  async destroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
