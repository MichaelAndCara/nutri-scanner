import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionResult } from '../../models/nutrition.model';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results-card">
      <div class="res-head">
        <div>
          <div class="conf-badge" [class]="result.confidence">{{ confLabel }}</div>
          <p class="serving">
            Serving: <strong>{{ result.servingSize }}</strong>
            @if (result.servingsPerContainer) { · {{ result.servingsPerContainer }} servings/container }
          </p>
        </div>
        <button class="close-btn" (click)="cleared.emit()">✕</button>
      </div>

      <div class="hi-grid">
          <div class="hi-card">
            <span class="hi-lbl">Calories</span>
            <span class="hi-val">{{ result.calories }}</span>
          </div>
          <div class="hi-card">
            <span class="hi-lbl">Fat</span>
            <span class="hi-val">{{ result.fat }}g</span>
          </div>
          <div class="hi-card">
            <span class="hi-lbl">Fiber</span>
            <span class="hi-val">{{ result.fiber }}g</span>
          </div>
      </div>

      <div class="res-footer">
        <span>{{ result.timestamp | date:'shortTime' }}</span>
        <img [src]="result.imageDataUrl" class="thumb" alt="Scanned label" />
      </div>
    </div>
  `,
  styleUrl: './results.component.scss'
})
export class ResultsComponent {
  @Input({ required: true }) result!: NutritionResult;
  @Output() cleared = new EventEmitter<void>();

  Math = Math;

  // get highlights(): NutrientInfo[] { return this.result.nutrients.filter(n => n.highlight); }
  // get others(): NutrientInfo[] { return this.result.nutrients.filter(n => !n.highlight); }
  get calPct(): number { return Math.min((this.result.calories / 2000) * 100, 100); }
  get calLevel(): string { return this.calPct < 20 ? 'low' : this.calPct < 40 ? 'moderate' : 'high'; }
  get confLabel(): string {
    return { high: '✓ High confidence', medium: '~ Medium confidence', low: '! Low confidence' }[this.result.confidence];
  }
  dvClass(pct: number): string { return pct <= 5 ? 'low' : pct <= 20 ? 'moderate' : 'high'; }
}
