import { Point } from "./point.model";

export interface NutritionResult {
  id: string;
  timestamp: Date;
  imageDataUrl: string;
  productName: string;
  servingSize: string;
  servingGrams?: number;
  servingsPerContainer?: number;
  calories: number;
  fat: number;
  fiber: number;
  rawText?: string;
  confidence: 'high' | 'medium' | 'low';
  points: Point[];
}

export interface ScanState {
  status: 'idle' | 'capturing' | 'analyzing' | 'done' | 'error';
  error?: string;
}
