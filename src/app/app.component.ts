import { Component } from '@angular/core';
import { CameraComponent }  from './components/camera/camera.component';
import { ResultsComponent } from './components/results/results.component';
import { HistoryComponent } from './components/history/history.component';
import { NutritionResult }  from './models/nutrition.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CameraComponent, ResultsComponent, HistoryComponent],
  template: `
    <div class="app">
      <header class="header">
        <div class="logo"><span>🥗</span><span class="logo-txt">NutriScan</span></div>
        <nav class="tabs">
          <button class="tab" [class.active]="tab==='scan'"    (click)="tab='scan'">Scan</button>
          <button class="tab" [class.active]="tab==='history'" (click)="tab='history'">History</button>
        </nav>
      </header>

      <main class="main">
        @if (tab === 'scan') {
          <app-camera (imageCaptured)="onResult($event)" />
          @if (current) { <app-results [result]="current" (cleared)="current=null" /> }
        }
        @if (tab === 'history') {
          <app-history [history]="history" />
        }
      </main>
    </div>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  tab:     'scan' | 'history' = 'scan';
  current: NutritionResult | null = null;
  history: NutritionResult[] = [];

  onResult(r: NutritionResult): void {
    this.current = r;
    this.history.unshift(r);
  }
}
