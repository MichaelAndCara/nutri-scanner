import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionResult } from '../../models/nutrition.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="history-container">
      @if (history.length === 0) {
        <div class="empty-state">
          <span class="empty-icon">🔍</span>
          <p>No scans yet.<br>Scan a nutrition label to get started.</p>
        </div>
      } @else {
        <h2 class="history-title">Recent Scans</h2>
        <div class="history-list">
          @for (item of history; track item.id) {
            <div class="history-item">
              <img [src]="item.imageDataUrl" class="history-thumb" alt="Scanned label" />
              <div class="history-info">
                <p class="history-name">{{ item.productName }}</p>
                <p class="history-meta">
                  <span class="cal-pill">{{ item.calories }} cal</span>
                  <span class="fat-pill">
                    {{ getFat(item) }}g fat
                  </span>
                </p>
                <p class="history-time">{{ item.timestamp | date:'MMM d · h:mm a' }}</p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './history.component.scss'
})
export class HistoryComponent {
  @Input() history: NutritionResult[] = [];

  getFat(item: NutritionResult): number {
    return item.nutrients.find(n => n.label.toLowerCase().includes('total fat'))?.value ?? 0;
  }
}
