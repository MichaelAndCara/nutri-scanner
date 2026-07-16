export interface NutritionResult {
  id: string;
  timestamp: Date;
  imageDataUrl: string;
  productName: string;
  servingSize: string;
  servingsPerContainer?: number;
  calories: number;
  fat: number;
  fiber: number;
  rawText?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanState {
  status: 'idle' | 'capturing' | 'analyzing' | 'done' | 'error';
  error?: string;
}
