# NutriScan — Angular 20 · Tesseract.js · 100 % Local / Offline

Reads nutrition labels using on-device OCR. Zero CDN, zero API keys, zero external
network requests at runtime. Everything ships with the app.

---

## What's bundled locally

| Path (in repo)                             | What it is                          | Served at           |
|--------------------------------------------|-------------------------------------|---------------------|
| `public/tesseract/worker.min.js`           | Tesseract worker script             | `/tesseract/`       |
| `public/tesseract/tesseract-core-simd.wasm.js` | WASM core (SIMD build)          | `/tesseract/`       |
| `public/tesseract/tesseract-core-simd.wasm`| WASM binary                         | `/tesseract/`       |
| `public/tesseract/tesseract-core.wasm.js`  | WASM core (non-SIMD fallback)       | `/tesseract/`       |
| `public/tesseract/tesseract-core.wasm`     | WASM binary (non-SIMD fallback)     | `/tesseract/`       |
| `public/tessdata/eng.traineddata.gz`       | English LSTM trained model (~11 MB) | `/tessdata/`        |

These are copied verbatim into `dist/` by the Angular build via the `assets` block
in `angular.json`. The `createWorker()` call in `NutritionAiService` points at these
local paths — no CDN strings appear anywhere in the source code.

---

## Quick start

```bash
# 1. Install Angular + tesseract.js npm packages
npm install

# 2. Download the bundled Tesseract assets (only needed once after a fresh clone)
#    The files are already present if you downloaded the full zip.
#    To re-download manually:
node scripts/download-tessdata.mjs

# 3. Serve locally
npm start          # http://localhost:4200
```

> On first page load the browser fetches `eng.traineddata.gz` (~11 MB) from your
> own dev server, decompresses it, and caches it in the Tesseract worker. Subsequent
> scans use the cached model instantly.

---

## Production build

```bash
npm run build:prod
# Output: dist/nutri-scanner/
```

Deploy the entire `dist/nutri-scanner/` folder to any static host (Nginx, S3,
Netlify, Vercel, etc.). The WASM and `.traineddata.gz` files are large — make sure
your host does **not** apply gzip re-compression to `.wasm` or already-gzipped
`.traineddata.gz` files. Set `Content-Encoding: identity` for `*.traineddata.gz`.

---

## How it works

```
Camera / File Upload
      │
      ▼
CameraComponent
  └─ captures frame → canvas.toDataURL('image/jpeg')
      │
      ▼
NutritionAiService.analyzeImage(dataUrl)
  ├─ createWorker('eng', 1, {
  │     workerPath: '/tesseract/worker.min.js',      ← local
  │     corePath:   '/tesseract/tesseract-core-simd.wasm.js', ← local
  │     langPath:   '/tessdata',                     ← local
  │  })
  ├─ worker.recognize(dataUrl)  →  { text, confidence }
  └─ regex parser extracts: calories, 14 nutrients, serving size, product name
      │
      ▼
ResultsComponent  (calorie bar, highlight grid, full nutrient list)
HistoryComponent  (thumbnails + cal/fat pills)
```

---

## OCR tips

| Tip | Why |
|-----|-----|
| Fill the frame with the label | More pixels = better accuracy |
| Diffuse natural light | Avoids glare on glossy packaging |
| Keep the label flat | Curved bottles distort characters |
| High contrast labels (black on white) | Tesseract LSTM excels here |

---

## Angular 20 features used

- **Standalone components** — no NgModule
- **Signals** — `signal()` for `ScanState`, `ocrMessage`, `ocrProgress`
- **Control flow** — `@if`, `@for` in all templates
- **`@Input({ required: true })`** strict input binding
- **`OnDestroy`** — terminates the WASM worker on component teardown
