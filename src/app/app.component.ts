import { Component } from '@angular/core';
import { CameraComponent } from './components/camera/camera.component';
import { ResultsComponent } from './components/results/results.component';
import { HistoryComponent } from './components/history/history.component';
import { NutritionResult } from './models/nutrition.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CameraComponent, ResultsComponent, HistoryComponent],
  template: `
    <div class="app-container">
      <header class="app-header">
        <div class="header-content">
          <div class="logo">
            <span class="logo-icon">🥗</span>
            <span class="logo-text">NutriScan</span>
          </div>
          <nav class="nav-tabs">
            <button
              class="nav-tab"
              [class.active]="activeTab === 'scan'"
              (click)="activeTab = 'scan'"
            >Scan</button>
            <button
              class="nav-tab"
              [class.active]="activeTab === 'history'"
              (click)="activeTab = 'history'"
            >History</button>
          </nav>
        </div>
      </header>

      <main class="main-content">
        @if (activeTab === 'scan') {
          <div class="scan-layout">
            <app-camera (imageCaptured)="onImageCaptured($event)" />

            @if (currentResult) {
              <app-results [result]="currentResult" (cleared)="clearResult()" />
            }
          </div>
        }

        @if (activeTab === 'history') {
          <app-history [history]="scanHistory" />
        }
      </main>
    </div>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  activeTab: 'scan' | 'history' = 'scan';
  currentResult: NutritionResult | null = null;
  scanHistory: NutritionResult[] = [];

  onImageCaptured(result: NutritionResult): void {
    this.currentResult = result;
    this.scanHistory.unshift(result);
  }

  clearResult(): void {
    this.currentResult = null;
  }
}
