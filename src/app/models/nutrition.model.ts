export interface NutrientInfo {
  label: string;
  value: number;
  unit: string;
  dailyPct?: number;
  highlight?: boolean;
}

export interface NutritionResult {
  id: string;
  timestamp: Date;
  imageDataUrl: string;
  productName: string;
  servingSize: string;
  servingsPerContainer?: number;
  calories: number;
  caloriesFromFat?: number;
  nutrients: NutrientInfo[];
  rawText?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanState {
  status: 'idle' | 'capturing' | 'analyzing' | 'done' | 'error';
  error?: string;
}
