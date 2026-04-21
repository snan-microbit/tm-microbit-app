# Handoff: ML micro:bit UI Redesign

## Overview
Full visual and UX redesign of the ML micro:bit PWA — a Progressive Web App that lets students train image, audio and pose recognition models and send detected classes to a micro:bit via Bluetooth.

The redesign focuses on:
- Clearer visual hierarchy across all screens
- Step indicator in the training flow (Capturar → Entrenar → Probar)
- Bluetooth status badge prominently in the prediction header
- Better home screen project grid (grid layout instead of horizontal scroll)
- Sample thumbnail gallery preserved in class cards with delete per thumbnail
- Preview modal restored after training completes
- MakeCode panel header removed to give full height to the editor

## About the Design Files
`ML microbit Redesign.html` + `redesign-app.jsx` are **hi-fi React prototypes** — visual and interaction references. Implement all changes in the existing **vanilla JS + CSS codebase** (`index.html`, `css/styles.css`, `js/app.js`).

## Fidelity
**High-fidelity.** Recreate pixel-by-pixel. No framework change needed.

---

## Branch Setup

```bash
git checkout -b redesign/ui-improvements
```

---

## Files to Modify

| File | What changes |
|---|---|
| `css/styles.css` | Design tokens, card styles, step bar, BT badge, thumbnail gallery |
| `index.html` | Step indicator HTML, BT badge in prediction header, remove MakeCode header |
| `js/app.js` | `setTrainingStep()` helper, `updateBtBadge()` helper, call sites |

---

## Design Tokens

Replace the `:root` block in `css/styles.css`. **Refinado is recommended** — stays closest to Ceibal.

### Theme: Refinado (recommended)
```css
:root {
  --primary:        #009f95;
  --primary-hover:  #008680;
  --primary-light:  #e8f5f4;
  --primary-deep:   #005f58;

  --bg:             #f4f5f5;
  --bg-alt:         #edf7f6;
  --surface:        #ffffff;

  --text:           #1a1a1a;
  --text-mid:       #454545;
  --text-light:     #777777;

  --border:         #e0e0e0;
  --border-acc:     #c5e0de;

  --radius-sm:      8px;
  --radius:         12px;
  --radius-lg:      16px;

  --shadow:         0 1px 3px rgba(0,0,0,.07), 0 2px 8px rgba(0,0,0,.05);
  --shadow-md:      0 2px 8px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.05);
  --shadow-lg:      0 4px 20px rgba(0,0,0,.10);
}
```

See `redesign-app.jsx` → `THEMES` for `expresivo`, `minimo`, `oscuro` variants.

---

## Change 1 — Home Screen: Responsive Project Grid

**Problem:** Horizontal scroll row is hard to scan on tablets/laptops.

### css/styles.css — replace `.models-grid`
```css
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
/* remove: overflow-x, scroll-snap, -webkit-overflow-scrolling */

.model-card {
  width: auto;
  scroll-snap-align: unset;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  transition: box-shadow .15s;
  overflow: hidden;
}
.model-card:hover {
  box-shadow: var(--shadow-md);
}

/* Color accent bar at top of card */
.model-card-accent {
  height: 4px;
  opacity: .85;
  flex-shrink: 0;
}

/* Type badge */
.model-type-badge {
  display: inline-block;
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .04em;
  padding: 2px 8px;
  border-radius: 100px;
  text-transform: uppercase;
  margin-bottom: .5rem;
}
.model-type-badge--image { background: #E1F5EE; color: #1D9E75; }
.model-type-badge--audio { background: #E6F1FB; color: #378ADD; }
.model-type-badge--pose  { background: #EEEDFE; color: #7F77DD; }
```

### js/app.js — update `renderModels()` / `projectCards` template

Add accent bar and type badge inside each `.model-card`:
```js
const typeColors  = { image: '#1D9E75', audio: '#378ADD', pose: '#7F77DD' };
const typeLabels  = { image: 'Imagen',  audio: 'Audio',   pose: 'Pose'   };
const typeColor   = typeColors[model.projectType]  || '#009f95';
const typeLabel   = typeLabels[model.projectType]  || 'Imagen';

// As FIRST child of .model-card inner div:
`<div class="model-card-accent" style="background:${typeColor};"></div>
 <span class="model-type-badge model-type-badge--${model.projectType}">${typeLabel}</span>`
```

---

## Change 2 — Training Screen: Step Indicator

**Problem:** Users don't know where they are in the training flow.

### index.html — add immediately after `<header class="training-header">…</header>`
```html
<div class="training-steps" id="trainingSteps">
  <div class="training-step active" data-step="0">
    <div class="step-dot">1</div>
    <span class="step-label">Capturar muestras</span>
  </div>
  <div class="step-divider"></div>
  <div class="training-step" data-step="1">
    <div class="step-dot">2</div>
    <span class="step-label">Entrenar modelo</span>
  </div>
  <div class="step-divider"></div>
  <div class="training-step" data-step="2">
    <div class="step-dot">3</div>
    <span class="step-label">Probar modelo</span>
  </div>
</div>
```

### css/styles.css
```css
.training-steps {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow);
  flex-shrink: 0;
  overflow-x: auto;
  gap: 0;
}
.training-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 .5rem;
  height: 100%;
  border-bottom: 2.5px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
  flex-shrink: 0;
}
.training-step.active { border-bottom-color: var(--primary); }
.training-step.done   { border-bottom-color: var(--primary); }

.step-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--border);
  color: var(--text-light);
  font-size: .65rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background .2s, color .2s;
}
.training-step.active .step-dot,
.training-step.done   .step-dot { background: var(--primary); color: #fff; }

.training-step.done .step-dot { font-size: 0; }
.training-step.done .step-dot::before { content: '✓'; font-size: .7rem; font-weight: 900; }

.step-label {
  font-size: .8rem; font-weight: 500;
  color: var(--text-light);
  transition: color .2s;
}
.training-step.active .step-label { font-weight: 700; color: var(--text); }

.step-divider {
  flex: 1; height: 1px;
  background: var(--border);
  min-width: 12px;
}
```

### js/app.js — add helper + call sites

```js
// Add near top of file (after imports):
function setTrainingStep(stepIndex) {
  document.querySelectorAll('.training-step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < stepIndex)  el.classList.add('done');
    if (i === stepIndex) el.classList.add('active');
  });
}
```

Call it:
- Training screen opens → `setTrainingStep(0)`
- Train button clicked (start) → `setTrainingStep(1)`
- Training completes (callback) → `setTrainingStep(2)` (preview modal opens here)
- "Tomar más muestras" in preview modal → `setTrainingStep(0)`
- Re-entering training screen via Reentrenar → `setTrainingStep(0)`

---

## Change 3 — Prediction Screen: Bluetooth Status Badge in Header

**Problem:** BT state is only visible in a small button label — easy to miss.

### index.html — add inside `<header class="prediction-header">` after the `<h2>`:
```html
<div class="bt-status-badge" id="btStatusBadge" data-status="disconnected">
  <span class="bt-status-dot"></span>
  <span class="bt-status-label">Sin conexión</span>
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
  </svg>
</div>
```

### css/styles.css
```css
.bt-status-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: .72rem; font-weight: 700;
  flex-shrink: 0;
  transition: background .2s, color .2s;
}
.bt-status-dot {
  width: 7px; height: 7px;
  border-radius: 50%; flex-shrink: 0;
}
.bt-status-badge[data-status="disconnected"] { background: #fee2e2; color: #e63946; }
.bt-status-badge[data-status="disconnected"] .bt-status-dot { background: #e63946; }

.bt-status-badge[data-status="connecting"]   { background: #fef3c7; color: #d97706; }
.bt-status-badge[data-status="connecting"]   .bt-status-dot { background: #f59e0b; animation: pulse .6s infinite; }

.bt-status-badge[data-status="connected"]    { background: #d1fae5; color: #059669; }
.bt-status-badge[data-status="connected"]    .bt-status-dot { background: #10b981; animation: pulse 2s infinite; }
```

### js/app.js — add helper + call sites
```js
function updateBtBadge(status) {
  // status: 'disconnected' | 'connecting' | 'connected'
  const badge = document.getElementById('btStatusBadge');
  if (!badge) return;
  const labels = {
    disconnected: 'Sin conexión',
    connecting:   'Conectando...',
    connected:    'Conectado',
  };
  badge.dataset.status = status;
  badge.querySelector('.bt-status-label').textContent = labels[status];
}
```

Search `app.js` for `badge-connected`, `badge-connecting`, `badge-disconnected` — call `updateBtBadge(...)` at each of those existing state-change points.

---

## Change 4 — Remove MakeCode Panel Header

**Problem:** A header bar with title + toggle button wastes ~44px above the iframe.

### index.html
```html
<!-- BEFORE -->
<div class="makecode-inline-panel" id="makecodeInlinePanel">
  <div class="makecode-panel-header">…</div>   ← DELETE
  <iframe id="makecodeInlineFrame" …></iframe>
</div>

<!-- AFTER -->
<div class="makecode-inline-panel" id="makecodeInlinePanel">
  <iframe id="makecodeInlineFrame" allow="usb; autoplay; camera; microphone;" src="about:blank"></iframe>
</div>
```

### css/styles.css
Remove `.makecode-panel-header` styles. Ensure iframe fills full panel:
```css
.makecode-inline-panel iframe {
  flex: 1; width: 100%; height: 100%;
  border: none; display: block;
}
```

---

## Change 5 — Training Screen: Sample Thumbnail Gallery (no visual change, style update only)

The thumbnail gallery already exists and works. Apply these style updates only:

### css/styles.css
```css
/* Show gallery always when card is active (not just on hover) */
.training-class-card.class-card-active .sample-gallery {
  display: flex;
  max-height: 130px;
  overflow-y: auto;
  gap: 4px;
  flex-wrap: wrap;
  padding: 6px 0 4px;
}

.sample-thumb {
  position: relative;
  width: 52px; height: 52px;
  flex-shrink: 0;
}
.sample-thumb img {
  width: 52px; height: 52px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.btn-delete-sample {
  position: absolute;
  top: -4px; right: -4px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #e63946;
  color: #fff;
  border: 1.5px solid #fff;
  font-size: 9px; font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; line-height: 1; z-index: 1;
}
```

---

## Interaction Notes

### Preview modal (after training)
After training completes the **existing** `previewModal` opens automatically (already implemented in `app.js`). The step indicator should advance to step 3 at this moment. Two buttons:
- **"Tomar más muestras"** → closes modal, calls `setTrainingStep(0)`, returns to capture
- **"Programar micro:bit"** → closes modal, opens prediction screen (existing `openPredictionScreen()`)

No logic change needed — only add `setTrainingStep()` calls at the right moments.

### Retrain button (prediction screen)
`predictionRetrainBtn` already calls `enterCaptureMode()` which returns to training. Add `setTrainingStep(0)` inside `enterCaptureMode()` or right after it's called.

### Continuous capture toggle
No logic change needed. Only style update: when `batchRecordingActive === true`, the hold button should visually show a recording state:
```css
.btn-capture-hold-unified.capturing {
  animation: pulse-recording .6s infinite;
}
```
Add/remove `.capturing` class on the button when toggling `batchRecordingActive`.

---

## Claude Code Prompt

```
I need you to implement a UI redesign in this PWA project.
All instructions are in `design_handoff/README.md`.
Open `design_handoff/ML microbit Redesign.html` in a browser to see the intended result.

Implement all 5 changes from the README one at a time:
1. Home screen responsive grid + type badges
2. Training screen step indicator
3. Prediction screen Bluetooth status badge in header
4. Remove MakeCode panel header
5. Sample thumbnail gallery style updates

After each change tell me which file was modified and what lines changed.
Do not change any JavaScript logic unless the README explicitly says to.
```

---

## QA Checklist

- [ ] Home grid: responsive 2-3 cols, New Project card always first
- [ ] Home cards: type badge + accent bar visible
- [ ] Step indicator: shows on training screen, advances correctly
- [ ] Step indicator: resets to step 1 when re-entering training
- [ ] Preview modal opens after training completes
- [ ] "Tomar más muestras" resets step indicator to step 1
- [ ] BT badge in prediction header: updates color + label on all state changes
- [ ] MakeCode iframe fills full panel height (no header bar above it)
- [ ] Thumbnail gallery visible in active class card, thumbnails deletable
- [ ] Capture toggle button shows visual active state while recording
- [ ] All existing functionality unchanged (capture, train, predict, BT, MakeCode)
- [ ] PWA offline still works (service worker)
- [ ] Mobile layout intact at 375px and 768px
