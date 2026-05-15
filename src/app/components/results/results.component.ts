import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionResult, NutrientInfo } from '../../models/nutrition.model';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results-card">
      <div class="results-header">
        <div class="product-info">
          <div class="confidence-badge" [class]="result.confidence">
            {{ confidenceLabel }}
          </div>
          <h2 class="product-name">{{ result.productName }}</h2>
          <p class="serving-info">
            Serving: <strong>{{ result.servingSize }}</strong>
            @if (result.servingsPerContainer) {
              · {{ result.servingsPerContainer }} servings/container
            }
          </p>
        </div>
        <button class="close-btn" (click)="cleared.emit()" aria-label="Close">✕</button>
      </div>

      <div class="calories-hero">
        <div class="calories-main">
          <span class="calories-label">Calories</span>
          <span class="calories-value">{{ result.calories }}</span>
          @if (result.caloriesFromFat) {
            <span class="calories-sub">{{ result.caloriesFromFat }} from fat</span>
          }
        </div>
        <div class="calorie-bar">
          <div
            class="calorie-fill"
            [style.width.%]="caloriePercent"
            [class]="calorieLevel"
          ></div>
        </div>
        <p class="calorie-context">{{ calorieContext }}</p>
      </div>

      <div class="highlights-grid">
        @for (n of highlights; track n.label) {
          <div class="highlight-card">
            <span class="nutrient-label">{{ n.label }}</span>
            <span class="nutrient-value">{{ n.value }}{{ n.unit }}</span>
            @if (n.dailyPct != null) {
              <div class="dv-bar">
                <div
                  class="dv-fill"
                  [style.width.%]="Math.min(n.dailyPct, 100)"
                  [class]="getDvClass(n.dailyPct)"
                ></div>
              </div>
              <span class="dv-label">{{ n.dailyPct }}% DV</span>
            }
          </div>
        }
      </div>

      <div class="nutrients-list">
        <h3 class="section-title">Full Nutrition Facts</h3>
        @for (n of others; track n.label) {
          <div class="nutrient-row">
            <span class="row-label">{{ n.label }}</span>
            <div class="row-right">
              <span class="row-value">{{ n.value }}{{ n.unit }}</span>
              @if (n.dailyPct != null) {
                <span class="row-dv">{{ n.dailyPct }}%</span>
              }
            </div>
          </div>
        }
      </div>

      <div class="scan-footer">
        <span>{{ result.timestamp | date:'shortTime' }}</span>
        <div class="thumbnail-wrap">
          <img [src]="result.imageDataUrl" class="thumbnail" alt="Scanned label" />
        </div>
      </div>
    </div>
  `,
  styleUrl: './results.component.scss'
})
export class ResultsComponent {
  @Input({ required: true }) result!: NutritionResult;
  @Output() cleared = new EventEmitter<void>();

  Math = Math;

  get highlights(): NutrientInfo[] {
    return this.result.nutrients.filter(n => n.highlight);
  }

  get others(): NutrientInfo[] {
    return this.result.nutrients.filter(n => !n.highlight);
  }

  get caloriePercent(): number {
    return Math.min((this.result.calories / 2000) * 100, 100);
  }

  get calorieLevel(): string {
    const pct = this.caloriePercent;
    if (pct < 20) return 'low';
    if (pct < 40) return 'moderate';
    return 'high';
  }

  get calorieContext(): string {
    const pct = Math.round(this.caloriePercent);
    return `${pct}% of a 2,000 cal daily value`;
  }

  get confidenceLabel(): string {
    const map: Record<string, string> = {
      high: '✓ High confidence',
      medium: '~ Medium confidence',
      low: '! Low confidence'
    };
    return map[this.result.confidence];
  }

  getDvClass(pct: number): string {
    if (pct <= 5) return 'low';
    if (pct <= 20) return 'moderate';
    return 'high';
  }
}
