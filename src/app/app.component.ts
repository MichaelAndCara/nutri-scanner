import { Component } from '@angular/core';
import { CameraComponent } from './components/camera/camera.component';
import { ResultsComponent } from './components/results/results.component';
import { NutritionResult } from './models/nutrition.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CameraComponent, ResultsComponent],
  template: `
    <div class="app">
     <main class="main">
        <app-camera (imageCaptured)="onResult($event)" />
          @if (current) { <app-results [result]="current" (cleared)="current=null" /> }
      </main>
    </div>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  current: NutritionResult | null = null;

  onResult(r: NutritionResult): void {
    this.current = r;
  }
}
