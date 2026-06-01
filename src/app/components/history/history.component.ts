import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionResult } from '../../models/nutrition.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hist-wrap">
      @if (history.length === 0) {
        <div class="empty"><span>🔍</span><p>No scans yet.<br>Scan a nutrition label to get started.</p></div>
      } @else {
        <h2 class="sec-title">Recent Scans</h2>
        @for (item of history; track item.id) {
          <div class="hist-item">
            <img [src]="item.imageDataUrl" class="thumb" alt="label" />
            <div class="info">
              <p class="name">{{ item.productName }}</p>
              <div class="pills">
                <span class="pill cal">{{ item.calories }} cal</span>
                <span class="pill fat">{{ getFat(item) }}g fat</span>
              </div>
              <p class="time">{{ item.timestamp | date:'MMM d · h:mm a' }}</p>
            </div>
          </div>
        }
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
