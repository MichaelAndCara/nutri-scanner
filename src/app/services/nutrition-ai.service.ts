import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';
import { NutritionResult, NutrientInfo } from '../models/nutrition.model';

// ---------------------------------------------------------------------------
// Nutrient extraction rules: [label, regex, unit, highlight, dailyValueRef]
// dailyValueRef is the FDA reference amount used to compute % DV (or null)
// ---------------------------------------------------------------------------
interface NutrientRule {
  label: string;
  pattern: RegExp;
  unit: string;
  highlight: boolean;
  dvRef: number | null; // grams/mg reference for % DV calculation
}

const NUTRIENT_RULES: NutrientRule[] = [
  { label: 'Total Fat', pattern: /total\s*fat\s+([\d.]+)\s*g/i, unit: 'g', highlight: true, dvRef: 78 },
  { label: 'Saturated Fat', pattern: /saturated\s*fat\s+([\d.]+)\s*g/i, unit: 'g', highlight: false, dvRef: 20 },
  { label: 'Trans Fat', pattern: /trans\s*fat\s+([\d.]+)\s*g/i, unit: 'g', highlight: false, dvRef: null },
  { label: 'Cholesterol', pattern: /cholesterol\s+([\d.]+)\s*mg/i, unit: 'mg', highlight: false, dvRef: 300 },
  { label: 'Sodium', pattern: /sodium\s+([\d.]+)\s*mg/i, unit: 'mg', highlight: true, dvRef: 2300 },
  { label: 'Total Carbohydrate', pattern: /total\s*carb(?:ohydrate)?\s+([\d.]+)\s*g/i, unit: 'g', highlight: true, dvRef: 275 },
  { label: 'Dietary Fiber', pattern: /dietary\s*fiber\s+([\d.]+)\s*g/i, unit: 'g', highlight: false, dvRef: 28 },
  { label: 'Total Sugars', pattern: /total\s*sugars?\s+([\d.]+)\s*g/i, unit: 'g', highlight: false, dvRef: null },
  { label: 'Added Sugars', pattern: /added\s*sugars?\s+([\d.]+)\s*g/i, unit: 'g', highlight: false, dvRef: 50 },
  { label: 'Protein', pattern: /protein\s+([\d.]+)\s*g/i, unit: 'g', highlight: true, dvRef: 50 },
  { label: 'Vitamin D', pattern: /vitamin\s*d\s+([\d.]+)\s*mc?g/i, unit: 'mcg', highlight: false, dvRef: 20 },
  { label: 'Calcium', pattern: /calcium\s+([\d.]+)\s*mg/i, unit: 'mg', highlight: false, dvRef: 1300 },
  { label: 'Iron', pattern: /iron\s+([\d.]+)\s*mg/i, unit: 'mg', highlight: false, dvRef: 18 },
  { label: 'Potassium', pattern: /potassium\s+([\d.]+)\s*mg/i, unit: 'mg', highlight: false, dvRef: 4700 },
];

@Injectable({ providedIn: 'root' })
export class NutritionAiService {
  private worker: Worker | null = null;

  /** Lazily create and cache the Tesseract worker */
  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = await createWorker('eng', 1, {
        // Use CDN-hosted trained data so no local assets are needed
        workerPath: '/assets/tesseract/worker.min.js',  //'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        langPath: '/assets/tesseract/',  //'https://tessdata.projectnaptha.com/4.0.0',
        corePath: '/assets/tesseract/' //'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
      });
    }
    return this.worker;
  }

  async analyzeImage(imageDataUrl: string): Promise<NutritionResult> {
    const worker = await this.getWorker();

    // Run OCR
    const { data } = await worker.recognize(imageDataUrl);
    const rawText = data.text;
    const ocrConfidence = data.confidence; // 0–100

    // Parse extracted text into structured nutrition data
    const nutrients = this.parseNutrients(rawText);
    const calories = this.parseCalories(rawText);
    const caloriesFromFat = this.parseCaloriesFromFat(rawText);
    const servingSize = this.parseServingSize(rawText);
    const servingsPerContainer = this.parseServingsPerContainer(rawText);
    const productName = this.parseProductName(rawText);

    // Map OCR confidence (0-100) to our three-tier scale
    const confidence: 'high' | 'medium' | 'low' =
      ocrConfidence >= 70 ? 'high' :
        ocrConfidence >= 40 ? 'medium' : 'low';

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      imageDataUrl,
      productName,
      servingSize,
      servingsPerContainer,
      calories,
      caloriesFromFat,
      nutrients,
      rawText,
      confidence,
    };
  }

  // -------------------------------------------------------------------------
  // Parsers
  // -------------------------------------------------------------------------

  private parseCalories(text: string): number {
    // "Calories 250" or "Calories\n250"
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
    // Grab the first non-empty line that looks like a product name
    // (not "Nutrition Facts", not a number-heavy line)
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/nutrition\s*facts/i.test(line)) continue;
      if (/serving|calories|amount|daily\s*value/i.test(line)) continue;
      if (/^\d/.test(line)) continue;
      if (line.length >= 4 && line.length <= 60) return line;
    }
    return 'Nutrition Facts';
  }

  private parseNutrients(text: string): NutrientInfo[] {
    const results: NutrientInfo[] = [];

    for (const rule of NUTRIENT_RULES) {
      const m = text.match(rule.pattern);
      if (!m) continue;

      const value = parseFloat(m[1]);
      // Try to extract the % DV that OCR found on the same/adjacent line
      const dvPct = this.extractDvPct(text, rule.label) ??
        (rule.dvRef != null ? Math.round((value / rule.dvRef) * 100) : undefined);

      results.push({
        label: rule.label,
        value,
        unit: rule.unit,
        dailyPct: dvPct ?? undefined,
        highlight: rule.highlight,
      });
    }

    return results;
  }

  /**
   * Try to find the "XX%" that follows a nutrient name on OCR text.
   * Nutrition labels put % DV on the same logical line, but OCR may split it.
   */
  private extractDvPct(text: string, label: string): number | undefined {
    // Build a lookahead pattern: label ... <number>%
    const escaped = label.replace(/\s+/g, '\\s+');
    const re = new RegExp(escaped + '[^\\n]{0,40}(\\d+)\\s*%', 'i');
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : undefined;
  }

  /** Clean up the Tesseract worker when the app closes */
  async destroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
