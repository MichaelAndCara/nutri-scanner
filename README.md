# NutriScan — Angular 20 Nutrition Label Scanner (Tesseract OCR)

A mobile-first Angular 20 app that uses the device camera and **Tesseract.js** (on-device OCR) to read and parse nutritional information from food labels — no API key or internet connection required after initial load.

## Features

- 📸 **Live camera capture** — uses the rear-facing camera on mobile
- 🖼️ **File upload fallback** — upload any photo from your gallery
- 🔤 **On-device OCR** — Tesseract.js v5 runs entirely in the browser via WebAssembly
- 📊 **Structured parsing** — regex engine extracts calories, fat, sodium, carbs, protein, and 14 nutrients
- 📈 **% Daily Value calculation** — computed from FDA reference values
- 🔒 **100% offline / private** — image never leaves the device

## Setup

```bash
npm install
npm start
# Open http://localhost:4200
```

No API key needed. Tesseract downloads its English trained data (~10MB) from CDN on first use and caches it in the browser.

## How It Works

1. `CameraComponent` captures a frame via `getUserMedia` or file upload
2. `NutritionAiService.analyzeImage()` calls `tesseract.js` `createWorker('eng')`
3. Tesseract runs LSTM OCR on the image and returns raw text + confidence score
4. A regex-based parser (`NUTRIENT_RULES`) extracts each nutrient by pattern matching
5. % Daily Value is computed from FDA reference amounts where Tesseract didn't find a printed %
6. `ResultsComponent` renders the structured output

## OCR Tips for Best Results

- **Good lighting** — diffuse natural light beats direct flash
- **Flat label** — curved bottles cause OCR errors; flatten the label if possible
- **Fill the frame** — zoom in so the label fills at least 60% of the viewfinder
- **High contrast** — black text on white background is ideal; avoid glossy reflections

## Project Structure

```
src/app/
├── app.component.ts
├── app.config.ts
├── models/
│   └── nutrition.model.ts        # NutritionResult, NutrientInfo interfaces
├── services/
│   └── nutrition-ai.service.ts   # Tesseract.js OCR + regex nutrition parser
└── components/
    ├── camera/                   # Camera viewfinder, capture, upload, progress
    ├── results/                  # Nutrition display with calorie bar + DV charts
    └── history/                  # Scan history list
```

## Angular 20 Features Used

- Standalone components (no NgModule)
- Signal-based state: `signal()` for `ScanState`, `ocrMessage`, `ocrProgress`
- Control flow syntax: `@if`, `@for` in all templates
- `@Input({ required: true })` for strict input binding
- `OnDestroy` lifecycle to terminate the Tesseract worker
