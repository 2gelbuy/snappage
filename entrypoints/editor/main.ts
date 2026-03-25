import './style.css';

// === Types ===
type Tool = 'select' | 'crop' | 'arrow' | 'rect' | 'text' | 'blur';

interface DrawObject {
  type: 'arrow' | 'rect' | 'text' | 'blur';
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  lineWidth: number;
  text?: string;
  fontSize?: number;
}

// === State ===
let baseImage: HTMLImageElement | null = null;
let objects: DrawObject[] = [];
let undoStack: DrawObject[][] = [];
let redoStack: DrawObject[][] = [];
let currentTool: Tool = 'select';
let isDrawing = false;
let drawStart = { x: 0, y: 0 };
let tempObj: DrawObject | null = null;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let selectedIndex = -1;
let isDraggingSelected = false;
let dragOffset = { x: 0, y: 0 };

// === DOM ===
const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const canvasArea = document.getElementById('canvas-area') as HTMLDivElement;
const cropOverlay = document.getElementById('crop-overlay') as HTMLDivElement;
const cropSelection = document.getElementById('crop-selection') as HTMLDivElement;
const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
const colorInput = document.getElementById('tool-color') as HTMLInputElement;
const colorPreview = document.getElementById('color-preview') as HTMLSpanElement;
const sizeSelect = document.getElementById('tool-size') as HTMLSelectElement;
const fontSizeSelect = document.getElementById('font-size') as HTMLSelectElement;
const formatSelect = document.getElementById('export-format') as HTMLSelectElement;
const statusDims = document.getElementById('status-dims') as HTMLSpanElement;
const statusInfo = document.getElementById('status-info') as HTMLSpanElement;
const toolButtons = document.querySelectorAll<HTMLButtonElement>('.tool-btn');
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;

// === Init: load image from background ===
async function init() {
  statusInfo.textContent = 'Loading screenshot...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE' });
    if (!response?.dataUrl) {
      statusInfo.textContent = 'No screenshot found. Capture one first.';
      return;
    }

    baseImage = await loadImage(response.dataUrl);
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;

    // Init crop to full image
    cropRect = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };

    redraw();
    updateStatus();
    statusInfo.textContent = 'Ready — choose a tool and start editing';
  } catch (err) {
    statusInfo.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

// === Drawing ===
function redraw() {
  if (!baseImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0);

  for (let i = 0; i < objects.length; i++) {
    drawObject(ctx, objects[i]);
    // Draw selection highlight
    if (i === selectedIndex) {
      drawSelectionHighlight(ctx, objects[i]);
    }
  }
  if (tempObj) {
    drawObject(ctx, tempObj);
  }

  updateUndoButtons();
}

function drawObject(c: CanvasRenderingContext2D, obj: DrawObject) {
  c.save();
  c.strokeStyle = obj.color;
  c.fillStyle = obj.color;
  c.lineWidth = obj.lineWidth;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const x = Math.min(obj.x1, obj.x2);
  const y = Math.min(obj.y1, obj.y2);
  const w = Math.abs(obj.x2 - obj.x1);
  const h = Math.abs(obj.y2 - obj.y1);

  switch (obj.type) {
    case 'arrow': {
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const headLen = Math.max(12, obj.lineWidth * 5);
      // Line
      c.beginPath();
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2, obj.y2);
      c.stroke();
      // Arrowhead
      c.beginPath();
      c.moveTo(obj.x2, obj.y2);
      c.lineTo(obj.x2 - headLen * Math.cos(angle - 0.4), obj.y2 - headLen * Math.sin(angle - 0.4));
      c.moveTo(obj.x2, obj.y2);
      c.lineTo(obj.x2 - headLen * Math.cos(angle + 0.4), obj.y2 - headLen * Math.sin(angle + 0.4));
      c.stroke();
      break;
    }
    case 'rect': {
      c.strokeRect(x, y, w, h);
      break;
    }
    case 'text': {
      if (obj.text) {
        c.font = `${obj.fontSize || 28}px "${getComputedStyle(document.body).fontFamily}"`;
        c.fillText(obj.text, obj.x1, obj.y1);
      }
      break;
    }
    case 'blur': {
      if (w > 0 && h > 0) {
        // Pixelate the region
        const pixelSize = Math.max(8, Math.round(Math.min(w, h) / 8));
        const imgData = c.getImageData(x, y, w, h);
        const d = imgData.data;
        for (let py = 0; py < h; py += pixelSize) {
          for (let px = 0; px < w; px += pixelSize) {
            // Average the pixel block
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
              for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
                const idx = ((py + dy) * w + (px + dx)) * 4;
                r += d[idx]; g += d[idx + 1]; b += d[idx + 2]; count++;
              }
            }
            r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
            // Fill the block
            for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
              for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
                const idx = ((py + dy) * w + (px + dx)) * 4;
                d[idx] = r; d[idx + 1] = g; d[idx + 2] = b;
              }
            }
          }
        }
        c.putImageData(imgData, x, y);
      }
      break;
    }
  }
  c.restore();
}

function drawSelectionHighlight(c: CanvasRenderingContext2D, obj: DrawObject) {
  c.save();
  c.strokeStyle = '#3b82f6';
  c.lineWidth = 2;
  c.setLineDash([6, 4]);
  const bounds = getObjectBounds(obj);
  c.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
  c.restore();
}

function getObjectBounds(obj: DrawObject): { x: number; y: number; w: number; h: number } {
  if (obj.type === 'text') {
    const fs = obj.fontSize || 28;
    const textW = obj.text ? obj.text.length * fs * 0.6 : 50;
    return { x: obj.x1, y: obj.y1 - fs, w: textW, h: fs + 4 };
  }
  const x = Math.min(obj.x1, obj.x2);
  const y = Math.min(obj.y1, obj.y2);
  return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
}

function hitTest(pos: { x: number; y: number }): number {
  // Test in reverse order (top objects first)
  for (let i = objects.length - 1; i >= 0; i--) {
    const b = getObjectBounds(objects[i]);
    const margin = 8;
    if (pos.x >= b.x - margin && pos.x <= b.x + b.w + margin &&
        pos.y >= b.y - margin && pos.y <= b.y + b.h + margin) {
      return i;
    }
  }
  return -1;
}

// === Canvas coordinates ===
function canvasCoords(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top) * scaleY),
  };
}

// === Tool Switching ===
function setTool(tool: Tool) {
  currentTool = tool;
  toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  textInput.classList.add('hidden');
  cropOverlay.classList.toggle('hidden', tool !== 'crop');
  cropOverlay.classList.toggle('active', tool === 'crop');

  if (tool === 'crop' && baseImage) {
    updateCropUI();
  }

  canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
}

// === Mouse Events ===
canvas.addEventListener('mousedown', (e) => {
  if (!baseImage) return;
  const pos = canvasCoords(e);

  if (currentTool === 'crop') return;

  // Select tool: click to select, drag to move
  if (currentTool === 'select') {
    const hit = hitTest(pos);
    if (hit !== selectedIndex) {
      selectedIndex = hit;
      redraw();
    }
    if (hit >= 0) {
      isDraggingSelected = true;
      pushUndo();
      dragOffset = { x: pos.x, y: pos.y };
    }
    return;
  }

  if (currentTool === 'text') {
    selectedIndex = -1;
    showTextInput(e.clientX, e.clientY, pos);
    return;
  }

  selectedIndex = -1;
  isDrawing = true;
  drawStart = pos;
  tempObj = {
    type: currentTool,
    x1: pos.x, y1: pos.y,
    x2: pos.x, y2: pos.y,
    color: colorInput.value,
    lineWidth: parseInt(sizeSelect.value),
  };
});

canvas.addEventListener('mousemove', (e) => {
  const pos = canvasCoords(e);

  // Dragging selected object
  if (isDraggingSelected && selectedIndex >= 0) {
    const dx = pos.x - dragOffset.x;
    const dy = pos.y - dragOffset.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      // Push undo only once per drag
      if (dragOffset.x !== 0 || dragOffset.y !== 0) {
        const obj = objects[selectedIndex];
        obj.x1 += dx; obj.y1 += dy;
        obj.x2 += dx; obj.y2 += dy;
        dragOffset = { x: pos.x, y: pos.y };
        redraw();
      }
    }
    return;
  }

  if (!isDrawing || !tempObj) return;
  tempObj.x2 = pos.x;
  tempObj.y2 = pos.y;
  redraw();
});

canvas.addEventListener('mouseup', () => {
  if (isDraggingSelected) {
    isDraggingSelected = false;
    return;
  }

  if (!isDrawing || !tempObj) return;
  isDrawing = false;

  const dx = Math.abs(tempObj.x2 - tempObj.x1);
  const dy = Math.abs(tempObj.y2 - tempObj.y1);
  if (dx > 5 || dy > 5) {
    pushUndo();
    objects.push(tempObj);
  }
  tempObj = null;
  redraw();
});

canvas.addEventListener('mouseleave', () => {
  isDraggingSelected = false;
  if (isDrawing) {
    isDrawing = false;
    if (tempObj) {
      pushUndo();
      objects.push(tempObj);
      tempObj = null;
    }
    redraw();
  }
});

// === Text Tool ===
function showTextInput(clientX: number, clientY: number, canvasPos: { x: number; y: number }) {
  textInput.classList.remove('hidden');
  textInput.style.left = clientX + 'px';
  textInput.style.top = clientY + 'px';
  textInput.style.fontSize = fontSizeSelect.value + 'px';
  textInput.style.color = colorInput.value;
  textInput.value = '';
  textInput.focus();

  const handler = () => {
    const text = textInput.value.trim();
    if (text) {
      pushUndo();
      objects.push({
        type: 'text',
        x1: canvasPos.x,
        y1: canvasPos.y + parseInt(fontSizeSelect.value),
        x2: canvasPos.x, y2: canvasPos.y,
        color: colorInput.value,
        lineWidth: 1,
        text,
        fontSize: parseInt(fontSizeSelect.value),
      });
      redraw();
    }
    textInput.classList.add('hidden');
    textInput.removeEventListener('blur', handler);
    textInput.removeEventListener('keydown', keyHandler);
  };

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handler();
    }
    if (e.key === 'Escape') {
      textInput.value = '';
      handler();
    }
  };

  textInput.addEventListener('blur', handler);
  textInput.addEventListener('keydown', keyHandler);
}

// === Crop Tool ===
function updateCropUI() {
  if (!baseImage) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const canvasRect = canvas.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const offsetX = canvasRect.left - areaRect.left;
  const offsetY = canvasRect.top - areaRect.top;

  cropSelection.style.left = (offsetX + cropRect.x * scaleX) + 'px';
  cropSelection.style.top = (offsetY + cropRect.y * scaleY) + 'px';
  cropSelection.style.width = (cropRect.w * scaleX) + 'px';
  cropSelection.style.height = (cropRect.h * scaleY) + 'px';
}

// Crop drag handling
let cropDragging = false;
let cropDragType: 'move' | 'nw' | 'ne' | 'sw' | 'se' = 'move';
let cropDragStart = { x: 0, y: 0, cx: 0, cy: 0, cw: 0, ch: 0 };

cropSelection.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  const target = e.target as HTMLElement;
  cropDragging = true;
  cropDragType = (target.dataset.handle as typeof cropDragType) || 'move';
  cropDragStart = { x: e.clientX, y: e.clientY, cx: cropRect.x, cy: cropRect.y, cw: cropRect.w, ch: cropRect.h };
});

document.addEventListener('mousemove', (e) => {
  if (!cropDragging || !baseImage) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const dx = (e.clientX - cropDragStart.x) * scaleX;
  const dy = (e.clientY - cropDragStart.y) * scaleY;

  if (cropDragType === 'move') {
    cropRect.x = Math.max(0, Math.min(canvas.width - cropRect.w, cropDragStart.cx + dx));
    cropRect.y = Math.max(0, Math.min(canvas.height - cropRect.h, cropDragStart.cy + dy));
  } else if (cropDragType === 'se') {
    cropRect.w = Math.max(20, Math.min(canvas.width - cropRect.x, cropDragStart.cw + dx));
    cropRect.h = Math.max(20, Math.min(canvas.height - cropRect.y, cropDragStart.ch + dy));
  } else if (cropDragType === 'nw') {
    const newX = Math.max(0, cropDragStart.cx + dx);
    const newY = Math.max(0, cropDragStart.cy + dy);
    cropRect.w = Math.max(20, cropDragStart.cw - (newX - cropDragStart.cx));
    cropRect.h = Math.max(20, cropDragStart.ch - (newY - cropDragStart.cy));
    cropRect.x = newX;
    cropRect.y = newY;
  } else if (cropDragType === 'ne') {
    const newY = Math.max(0, cropDragStart.cy + dy);
    cropRect.w = Math.max(20, Math.min(canvas.width - cropRect.x, cropDragStart.cw + dx));
    cropRect.h = Math.max(20, cropDragStart.ch - (newY - cropDragStart.cy));
    cropRect.y = newY;
  } else if (cropDragType === 'sw') {
    const newX = Math.max(0, cropDragStart.cx + dx);
    cropRect.w = Math.max(20, cropDragStart.cw - (newX - cropDragStart.cx));
    cropRect.h = Math.max(20, Math.min(canvas.height - cropRect.y, cropDragStart.ch + dy));
    cropRect.x = newX;
  }

  updateCropUI();
});

document.addEventListener('mouseup', () => { cropDragging = false; });

// === Undo/Redo ===
function pushUndo() {
  undoStack.push([...objects.map(o => ({ ...o }))]);
  redoStack = [];
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push([...objects.map(o => ({ ...o }))]);
  objects = undoStack.pop()!;
  redraw();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push([...objects.map(o => ({ ...o }))]);
  objects = redoStack.pop()!;
  redraw();
}

function updateUndoButtons() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

// === Export ===
function getExportCanvas(): HTMLCanvasElement {
  // Apply crop if crop tool was used and crop differs from full image
  const isCropped = cropRect.x > 0 || cropRect.y > 0 ||
    cropRect.w < canvas.width || cropRect.h < canvas.height;

  if (!isCropped) {
    return canvas;
  }

  // Create cropped canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(cropRect.w);
  cropCanvas.height = Math.round(cropRect.h);
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCtx.drawImage(
    canvas,
    Math.round(cropRect.x), Math.round(cropRect.y),
    Math.round(cropRect.w), Math.round(cropRect.h),
    0, 0,
    Math.round(cropRect.w), Math.round(cropRect.h)
  );
  return cropCanvas;
}

async function save() {
  if (!baseImage) return;
  redraw(); // ensure clean render

  const format = formatSelect.value;
  const exportCanvas = getExportCanvas();

  if (format === 'pdf') {
    savePDF(exportCanvas);
  } else {
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = exportCanvas.toDataURL(mime, format === 'jpeg' ? 0.92 : undefined);
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const filename = `screenshot_${new Date().toISOString().slice(0, 10)}.${ext}`;
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    statusInfo.textContent = `Saved as ${filename}`;
  }
}

async function savePDF(exportCanvas: HTMLCanvasElement) {
  statusInfo.textContent = 'Generating PDF...';
  const { jsPDF } = await import('jspdf');

  const w = exportCanvas.width;
  const h = exportCanvas.height;

  const pxToMm = 25.4 / 96;
  const widthMm = w * pxToMm;
  const heightMm = h * pxToMm;

  const orientation = widthMm > heightMm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [widthMm, heightMm],
  });

  const imgData = exportCanvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, widthMm, heightMm);

  const filename = `screenshot_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
  statusInfo.textContent = `Saved as ${filename}`;
}

// === OCR + Auto-Redact ===
const btnOcr = document.getElementById('btn-ocr') as HTMLButtonElement;
const btnRedact = document.getElementById('btn-redact') as HTMLButtonElement;
const ocrPanel = document.getElementById('ocr-panel') as HTMLDivElement;
const ocrText = document.getElementById('ocr-text') as HTMLPreElement;
const ocrCopy = document.getElementById('ocr-copy') as HTMLButtonElement;
const ocrClose = document.getElementById('ocr-close') as HTMLButtonElement;

// PII patterns for auto-redaction
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,            // email
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g, // phone
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,                     // IP address
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,                 // credit card
  /\b\d{3}-\d{2}-\d{4}\b/g,                                       // SSN
];

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

let lastOcrWords: OcrWord[] = [];

async function runOcr(): Promise<{ text: string; words: OcrWord[] }> {
  statusInfo.textContent = 'Loading OCR engine...';
  btnOcr.disabled = true;
  btnRedact.disabled = true;

  const Tesseract = await import('tesseract.js');

  statusInfo.textContent = 'Recognizing text...';
  const dataUrl = canvas.toDataURL('image/png');

  // Use createWorker for v7 — need blocks output to get word bboxes
  const worker = await Tesseract.createWorker('eng', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        statusInfo.textContent = `OCR: ${Math.round(m.progress * 100)}%`;
      }
    },
  });

  const result = await worker.recognize(dataUrl, undefined, { blocks: true });
  await worker.terminate();

  // Extract words from blocks → paragraphs → lines → words
  const words: OcrWord[] = [];
  if (result.data.blocks) {
    for (const block of result.data.blocks) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const word of line.words) {
            words.push({ text: word.text, bbox: word.bbox });
          }
        }
      }
    }
  }

  btnOcr.disabled = false;
  btnRedact.disabled = false;

  return { text: result.data.text, words };
}

btnOcr.addEventListener('click', async () => {
  try {
    const { text, words } = await runOcr();
    lastOcrWords = words;
    ocrText.textContent = text || '(No text detected)';
    ocrPanel.classList.remove('hidden');
    statusInfo.textContent = `OCR complete — ${words.length} words found`;
  } catch (err) {
    statusInfo.textContent = 'OCR error: ' + (err instanceof Error ? err.message : String(err));
    btnOcr.disabled = false;
    btnRedact.disabled = false;
  }
});

btnRedact.addEventListener('click', async () => {
  try {
    // Run OCR if not done yet
    if (lastOcrWords.length === 0) {
      const { words } = await runOcr();
      lastOcrWords = words;
    }

    // Find words matching PII patterns
    const fullText = lastOcrWords.map(w => w.text).join(' ');
    const piiMatches = new Set<string>();

    for (const pattern of PII_PATTERNS) {
      const copy = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = copy.exec(fullText)) !== null) {
        // Split matched text into individual words to find which OcrWords to blur
        const matchedTokens = match[0].split(/\s+/);
        for (const token of matchedTokens) {
          if (token.length > 2) piiMatches.add(token);
        }
      }
    }

    if (piiMatches.size === 0) {
      statusInfo.textContent = 'No sensitive data (emails, phones, IPs, cards) detected';
      return;
    }

    // Create blur objects for matched words
    // OCR runs on canvas pixel coords — 1:1 mapping, no scaling needed
    let blurCount = 0;

    pushUndo();
    for (const word of lastOcrWords) {
      const wordClean = word.text.replace(/[.,;:!?'"()\[\]{}]/g, '');
      if (piiMatches.has(wordClean) || piiMatches.has(word.text)) {
        const pad = 4;
        objects.push({
          type: 'blur',
          x1: Math.round(word.bbox.x0) - pad,
          y1: Math.round(word.bbox.y0) - pad,
          x2: Math.round(word.bbox.x1) + pad,
          y2: Math.round(word.bbox.y1) + pad,
          color: '#000',
          lineWidth: 1,
        });
        blurCount++;
      }
    }

    redraw();
    statusInfo.textContent = `Auto-redacted ${blurCount} sensitive items`;
  } catch (err) {
    statusInfo.textContent = 'Redaction error: ' + (err instanceof Error ? err.message : String(err));
    btnOcr.disabled = false;
    btnRedact.disabled = false;
  }
});

ocrCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ocrText.textContent || '');
    ocrCopy.textContent = 'Copied!';
    setTimeout(() => { ocrCopy.textContent = 'Copy'; }, 1500);
  } catch { /* no clipboard */ }
});

ocrClose.addEventListener('click', () => {
  ocrPanel.classList.add('hidden');
});

// === Toolbar Events ===
toolButtons.forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool as Tool));
});

colorInput.addEventListener('input', () => {
  colorPreview.style.background = colorInput.value;
});
colorPreview.style.background = colorInput.value;

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
btnReset.addEventListener('click', () => {
  if (objects.length === 0) return;
  pushUndo();
  objects = [];
  if (baseImage) {
    cropRect = { x: 0, y: 0, w: baseImage.width, h: baseImage.height };
  }
  redraw();
  statusInfo.textContent = 'All edits cleared';
});
btnSave.addEventListener('click', save);

// === Keyboard Shortcuts ===
document.addEventListener('keydown', (e) => {
  if (e.target === textInput) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedIndex >= 0) {
      e.preventDefault();
      pushUndo();
      objects.splice(selectedIndex, 1);
      selectedIndex = -1;
      redraw();
      return;
    }
  }
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); }

  if (!e.ctrlKey && !e.altKey) {
    switch (e.key.toLowerCase()) {
      case 'v': setTool('select'); break;
      case 'c': setTool('crop'); break;
      case 'a': setTool('arrow'); break;
      case 'r': setTool('rect'); break;
      case 't': setTool('text'); break;
      case 'b': setTool('blur'); break;
    }
  }
});

// === Status ===
function updateStatus() {
  if (!baseImage) return;
  statusDims.textContent = `${baseImage.width} × ${baseImage.height}px`;
}

// Window resize → update crop overlay position
window.addEventListener('resize', () => {
  if (currentTool === 'crop') updateCropUI();
});

// === Read URL params ===
const urlParams = new URLSearchParams(window.location.search);
const defaultFormat = urlParams.get('format');
if (defaultFormat && ['png', 'jpeg', 'pdf'].includes(defaultFormat)) {
  formatSelect.value = defaultFormat;
}

// === Start ===
init();
