import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionResult, NutrientInfo } from '../../models/nutrition.model';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results-card">
      <div class="res-head">
        <div>
          <div class="conf-badge" [class]="result.confidence">{{ confLabel }}</div>
          <h2 class="prod-name">{{ result.productName }}</h2>
          <p class="serving">
            Serving: <strong>{{ result.servingSize }}</strong>
            @if (result.servingsPerContainer) { · {{ result.servingsPerContainer }} servings/container }
          </p>
        </div>
        <button class="close-btn" (click)="cleared.emit()">✕</button>
      </div>

      <div class="cal-hero">
        <div class="cal-row">
          <span class="cal-lbl">Calories</span>
          <span class="cal-val">{{ result.calories }}</span>
          @if (result.caloriesFromFat) { <span class="cal-sub">{{ result.caloriesFromFat }} from fat</span> }
        </div>
        <div class="cal-track"><div class="cal-fill" [class]="calLevel" [style.width.%]="calPct"></div></div>
        <p class="cal-ctx">{{ Math.round(calPct) }}% of a 2,000 cal daily value</p>
      </div>

      <div class="hi-grid">
        @for (n of highlights; track n.label) {
          <div class="hi-card">
            <span class="hi-lbl">{{ n.label }}</span>
            <span class="hi-val">{{ n.value }}{{ n.unit }}</span>
            @if (n.dailyPct != null) {
              <div class="dv-track"><div class="dv-fill" [class]="dvClass(n.dailyPct!)" [style.width.%]="Math.min(n.dailyPct!, 100)"></div></div>
              <span class="dv-lbl">{{ n.dailyPct }}% DV</span>
            }
          </div>
        }
      </div>

      <div class="nut-list">
        <h3 class="sec-title">Full Nutrition Facts</h3>
        @for (n of others; track n.label) {
          <div class="nut-row">
            <span class="nr-lbl">{{ n.label }}</span>
            <div class="nr-right">
              <span class="nr-val">{{ n.value }}{{ n.unit }}</span>
              @if (n.dailyPct != null) { <span class="nr-dv">{{ n.dailyPct }}%</span> }
            </div>
          </div>
        }
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

  get highlights(): NutrientInfo[] { return this.result.nutrients.filter(n => n.highlight); }
  get others():     NutrientInfo[] { return this.result.nutrients.filter(n => !n.highlight); }
  get calPct():  number { return Math.min((this.result.calories / 2000) * 100, 100); }
  get calLevel(): string { return this.calPct < 20 ? 'low' : this.calPct < 40 ? 'moderate' : 'high'; }
  get confLabel(): string {
    return { high: '✓ High confidence', medium: '~ Medium confidence', low: '! Low confidence' }[this.result.confidence];
  }
  dvClass(pct: number): string { return pct <= 5 ? 'low' : pct <= 20 ? 'moderate' : 'high'; }
}
