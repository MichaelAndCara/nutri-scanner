import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import { NutritionResult } from '../models/nutrition.model';
import { Point } from '../models/point.model';

// ---------------------------------------------------------------------------
// All paths point to files bundled inside the Angular app under /public/.
// No CDN or external network request is made at runtime.
//
//   public/tesseract/worker.min.js          — Tesseract worker script
//   public/tesseract/tesseract-core-simd.wasm.js — WASM core (SIMD build)
//   public/tessdata/eng.traineddata.gz      — English trained model (~11 MB)
// ---------------------------------------------------------------------------
const LOCAL_WORKER_PATH = '/assets/tesseract/worker.min.js';
const LOCAL_CORE_PATH = '/assets/tesseract/tesseract-core-simd.wasm.js';
const LOCAL_LANG_PATH = '/assets/tessdata';   // tesseract.js appends /eng.traineddata.gz

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

    let nutritionResult: NutritionResult = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      imageDataUrl,
      productName: this.parseProductName(rawText),
      servingSize: this.parseServingSize(rawText),
      servingGrams: this.parseServingGrams(rawText),
      servingsPerContainer: this.parseServingsPerContainer(rawText),
      calories: this.parseCalories(rawText),
      fat: this.parseFat(rawText),
      fiber: this.parseFiber(rawText),
      rawText,
      confidence,
      points: []
    };

    nutritionResult.points = this.calculateMaxGramsPerServing(nutritionResult);

    return nutritionResult;
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

  /**
   * Extract the gram weight from the serving size line.
   * Handles formats like:
   *   "Serving Size 1 cup (240g)"
   *   "Serving Size 28g"
   *   "Serving Size 2 tbsp / 30 g"
   */
  private parseServingGrams(text: string): number | undefined {
    // First try: grab the whole serving size line, then find grams within it
    const lineMatch = text.match(/serving\s*size\s*[:\-]?\s*([^\n]{3,60})/i);
    if (lineMatch) {
      const line = lineMatch[1];
      // Match "240g", "240 g", "240 grams", "240 gram"
      const gMatch = line.match(/([\d.]+)\s*g(?:rams?)?\b/i);
      if (gMatch) return parseFloat(gMatch[1]);
    }

    // Fallback: scan the full text for any standalone gram weight near "serving"
    const fallback = text.match(
      /serving[^\n]{0,60}?([\d.]+)\s*g(?:rams?)?\b/i
    );
    return fallback ? parseFloat(fallback[1]) : undefined;
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

  private calculateMaxGramsPerServing(nutritionResult: NutritionResult): Point[] {
    let gramIncrement = (100 / nutritionResult.servingGrams!) * 0.01; // 1% of serving size in grams
    let maxGrams: number = 0;
    const servingGrams = nutritionResult?.servingGrams ?? 0;
    const servingsPerContainer = nutritionResult?.servingsPerContainer ?? 0;
    const target = servingGrams * servingsPerContainer;
    let tempGrams = 1;

    while (maxGrams <= target) {
      const tempIncrement = (tempGrams - servingGrams) * gramIncrement;
      const tempCalories = nutritionResult.calories + (nutritionResult.calories * tempIncrement);
      const tempFat = nutritionResult.fat + (nutritionResult.fat * tempIncrement);
      let tempFiber = nutritionResult.fiber + (nutritionResult.fiber * tempIncrement);

      if (tempFiber > 4) {
        tempFiber = 4;
      }

      const point: Point = {
        grams: tempGrams,
        points: ((tempCalories / 50) + (tempFat / 12) - (tempFiber / 5)),
        servings: 0
      };

      if (nutritionResult.points.length === 0) {
        nutritionResult.points.push(point);
      } else {
        const lastPoints = nutritionResult.points[nutritionResult.points.length - 1].points;
        const index = nutritionResult.points.findIndex(x => x.grams === tempGrams - 1);

        if (Math.round(point.points) === Math.round(lastPoints)) {
          nutritionResult.points[index] = point;
        } else {
          nutritionResult.points.push(point);
        }
      }
      tempGrams = tempGrams + 1;

      maxGrams++;
    }

    return nutritionResult.points;
  }

  /** Call this from the component's ngOnDestroy to free the WASM worker. */
  async destroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
