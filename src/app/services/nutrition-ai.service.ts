import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import { NutritionResult, NutrientInfo } from '../models/nutrition.model';

// ---------------------------------------------------------------------------
// All paths point to files bundled inside the Angular app under /public/.
// No CDN or external network request is made at runtime.
//
//   public/tesseract/worker.min.js          — Tesseract worker script
//   public/tesseract/tesseract-core-simd.wasm.js — WASM core (SIMD build)
//   public/tessdata/eng.traineddata.gz      — English trained model (~11 MB)
// ---------------------------------------------------------------------------
const LOCAL_WORKER_PATH  = '/tesseract/worker.min.js';
const LOCAL_CORE_PATH    = '/tesseract/tesseract-core-simd.wasm.js';
const LOCAL_LANG_PATH    = '/tessdata';   // tesseract.js appends /eng.traineddata.gz

// ---------------------------------------------------------------------------
// Nutrient extraction rules
// ---------------------------------------------------------------------------
interface NutrientRule {
  label: string;
  pattern: RegExp;
  unit: string;
  highlight: boolean;
  dvRef: number | null; // FDA reference amount for % DV calculation
}

const NUTRIENT_RULES: NutrientRule[] = [
  { label: 'Total Fat',          pattern: /total\s*fat\s+([\d.]+)\s*g/i,              unit: 'g',   highlight: true,  dvRef: 78   },
  { label: 'Saturated Fat',      pattern: /saturated\s*fat\s+([\d.]+)\s*g/i,           unit: 'g',   highlight: false, dvRef: 20   },
  { label: 'Trans Fat',          pattern: /trans\s*fat\s+([\d.]+)\s*g/i,               unit: 'g',   highlight: false, dvRef: null },
  { label: 'Cholesterol',        pattern: /cholesterol\s+([\d.]+)\s*mg/i,              unit: 'mg',  highlight: false, dvRef: 300  },
  { label: 'Sodium',             pattern: /sodium\s+([\d.]+)\s*mg/i,                   unit: 'mg',  highlight: true,  dvRef: 2300 },
  { label: 'Total Carbohydrate', pattern: /total\s*carb(?:ohydrate)?\s+([\d.]+)\s*g/i, unit: 'g',  highlight: true,  dvRef: 275  },
  { label: 'Dietary Fiber',      pattern: /dietary\s*fiber\s+([\d.]+)\s*g/i,           unit: 'g',   highlight: false, dvRef: 28   },
  { label: 'Total Sugars',       pattern: /total\s*sugars?\s+([\d.]+)\s*g/i,           unit: 'g',   highlight: false, dvRef: null },
  { label: 'Added Sugars',       pattern: /added\s*sugars?\s+([\d.]+)\s*g/i,           unit: 'g',   highlight: false, dvRef: 50   },
  { label: 'Protein',            pattern: /protein\s+([\d.]+)\s*g/i,                   unit: 'g',   highlight: true,  dvRef: 50   },
  { label: 'Vitamin D',          pattern: /vitamin\s*d\s+([\d.]+)\s*mc?g/i,            unit: 'mcg', highlight: false, dvRef: 20   },
  { label: 'Calcium',            pattern: /calcium\s+([\d.]+)\s*mg/i,                  unit: 'mg',  highlight: false, dvRef: 1300 },
  { label: 'Iron',               pattern: /iron\s+([\d.]+)\s*mg/i,                     unit: 'mg',  highlight: false, dvRef: 18   },
  { label: 'Potassium',          pattern: /potassium\s+([\d.]+)\s*mg/i,                unit: 'mg',  highlight: false, dvRef: 4700 },
];

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
      corePath:   LOCAL_CORE_PATH,
      langPath:   LOCAL_LANG_PATH,
      // Disable all logging in production; flip to console.log for debugging
      logger: () => { /* silent */ },
    });

    return this.worker;
  }

  async analyzeImage(imageDataUrl: string): Promise<NutritionResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(imageDataUrl);

    const rawText       = data.text;
    const ocrConfidence = data.confidence; // 0–100

    const confidence: 'high' | 'medium' | 'low' =
      ocrConfidence >= 70 ? 'high' :
      ocrConfidence >= 40 ? 'medium' : 'low';

    return {
      id:                  crypto.randomUUID(),
      timestamp:           new Date(),
      imageDataUrl,
      productName:         this.parseProductName(rawText),
      servingSize:         this.parseServingSize(rawText),
      servingsPerContainer:this.parseServingsPerContainer(rawText),
      calories:            this.parseCalories(rawText),
      caloriesFromFat:     this.parseCaloriesFromFat(rawText),
      nutrients:           this.parseNutrients(rawText),
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

  private parseCaloriesFromFat(text: string): number | undefined {
    const m = text.match(/calories\s*from\s*fat\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : undefined;
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
      if (/nutrition\s*facts/i.test(line))           continue;
      if (/serving|calories|amount|daily\s*value/i.test(line)) continue;
      if (/^\d/.test(line))                          continue;
      if (line.length >= 4 && line.length <= 60)     return line;
    }
    return 'Nutrition Facts';
  }

  private parseNutrients(text: string): NutrientInfo[] {
    return NUTRIENT_RULES.reduce<NutrientInfo[]>((acc, rule) => {
      const m = text.match(rule.pattern);
      if (!m) return acc;

      const value  = parseFloat(m[1]);
      const dvPct  = this.extractPrintedDvPct(text, rule.label)
                     ?? (rule.dvRef != null ? Math.round((value / rule.dvRef) * 100) : null);

      acc.push({ label: rule.label, value, unit: rule.unit, dailyPct: dvPct, highlight: rule.highlight });
      return acc;
    }, []);
  }

  /**
   * Try to find a printed "XX%" that immediately follows a nutrient name on
   * the OCR text (nutrition labels place % DV on the same logical line).
   */
  private extractPrintedDvPct(text: string, label: string): number | undefined {
    const escaped = label.replace(/\s+/g, '\\s+');
    const re = new RegExp(escaped + '[^\\n]{0,40}(\\d+)\\s*%', 'i');
    const m  = text.match(re);
    return m ? parseInt(m[1], 10) : undefined;
  }

  /** Call this from the component's ngOnDestroy to free the WASM worker. */
  async destroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
