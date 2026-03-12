import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

const ZOOM_OPTIONS = [50, 75, 100, 125, 150];
let pdfWorkerReadyPromise = null;

async function ensurePdfWorkerReady() {
  if (pdfWorkerReadyPromise) {
    return pdfWorkerReadyPromise;
  }
  pdfWorkerReadyPromise = (async () => {
    if (typeof window === "undefined") {
      return;
    }

    if ("Worker" in window) {
      try {
        const workerUrl = new URL(pdfjsWorkerUrl, window.location.href);
        pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: "module" });
        return;
      } catch (workerPortError) {
        // Ignore and fallback to fake-worker mode below.
      }
    }

    // Force fake-worker mode by exposing the worker module on the window scope.
    try {
      const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      globalThis.pdfjsWorker = workerModule;
    } catch (fakeWorkerError) {
      throw new Error(`Unable to initialize PDF runtime. ${String(fakeWorkerError?.message || fakeWorkerError)}`);
    }
  })();
  return pdfWorkerReadyPromise;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = url;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(value, fallback) {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9-_]+/g, "_");
  return cleaned || fallback;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFieldKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeFontFamily(value) {
  const raw = String(value || "").replace(/^[A-Z]{6}\+/, "").trim();
  if (!raw) {
    return "Arial";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("helvetica")) {
    return "Helvetica";
  }
  if (lower.includes("times")) {
    return "Times New Roman";
  }
  if (lower.includes("courier")) {
    return "Courier New";
  }
  if (lower.includes("arial")) {
    return "Arial";
  }
  return raw.split(",")[0] || "Arial";
}

function createTextElement({ x, y }) {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x,
    y,
    width: 260,
    height: 44,
    text: "Member Name",
    fontSize: 22,
    color: "#0f172a",
    fontFamily: "Arial",
    fontWeight: 400,
    fontStyle: "normal",
  };
}

function createBlankPage({ label = "Blank Page", width = 720, height = 1040 }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return {
    id: crypto.randomUUID(),
    label,
    width,
    height,
    backgroundDataUrl: canvas.toDataURL("image/png", 1),
    elements: [],
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createCoverCropDataUrl(sourceCanvas, rect) {
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png", 1);
}

function sampleTextColor(ctx, x, y, width, height) {
  const safeX = Math.floor(Math.max(0, x));
  const safeY = Math.floor(Math.max(0, y));
  const safeWidth = Math.floor(Math.max(1, width));
  const safeHeight = Math.floor(Math.max(1, height));
  try {
    const pixels = ctx.getImageData(safeX, safeY, safeWidth, safeHeight).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      const alpha = pixels[i + 3];
      if (alpha < 18) {
        continue;
      }
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = (red + green + blue) / 3;
      if (brightness > 244 && saturation < 0.06) {
        continue;
      }
      if (brightness < 245 || saturation > 0.07) {
        r += red;
        g += green;
        b += blue;
        count += 1;
      }
    }
    if (!count) {
      return "#0f172a";
    }
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  } catch (_error) {
    return "#0f172a";
  }
}

async function detectPdfTextElements(page, viewport, ctx, pageWidth, pageHeight) {
  const content = await page.getTextContent();
  const styleMap = content.styles || {};
  const fragments = [];
  for (const item of content.items || []) {
    const textValue = String(item?.str || "").trim();
    if (!textValue) {
      continue;
    }
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = clamp(Math.hypot(tx[2], tx[3]), 10, 72);
    const x = clamp(Math.round(tx[4]), 0, Math.max(0, pageWidth - 2));
    const y = clamp(Math.round(tx[5] - fontSize), 0, Math.max(0, pageHeight - 2));
    const width = clamp(Math.round((item.width || textValue.length * fontSize * 0.5) * viewport.scale), 40, pageWidth - x);
    const height = clamp(Math.round(fontSize * 1.35), 18, pageHeight - y);
    const itemStyle = styleMap[item.fontName] || {};
    const fontName = String(item.fontName || itemStyle.fontFamily || "");
    const fontFamily = normalizeFontFamily(itemStyle.fontFamily || fontName);
    const fontWeight = /bold|black|heavy|semibold|demibold/i.test(fontName) ? 700 : 400;
    const fontStyle = /italic|oblique/i.test(fontName) ? "italic" : "normal";
    fragments.push({
      x,
      y,
      width,
      height,
      text: textValue.trim(),
      fontSize: Math.round(fontSize),
      fontFamily,
      fontWeight,
      fontStyle,
    });
  }

  fragments.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const merged = [];
  for (const part of fragments) {
    const prev = merged[merged.length - 1];
    const sameLine = prev && Math.abs(part.y - prev.y) <= Math.max(4, Math.min(prev.height, part.height) * 0.45);
    const gap = prev ? (part.x - (prev.x + prev.width)) : Infinity;
    const closeEnough = gap <= Math.max(12, part.fontSize * 1.2);
    if (sameLine && closeEnough) {
      const joinedText = `${prev.text} ${part.text}`.replace(/\s+/g, " ").trim();
      prev.text = joinedText;
      prev.width = Math.max(prev.width, (part.x + part.width) - prev.x);
      prev.height = Math.max(prev.height, part.height);
      prev.fontSize = Math.round((prev.fontSize + part.fontSize) / 2);
      prev.fontFamily = prev.fontFamily || part.fontFamily;
      prev.fontWeight = Math.max(prev.fontWeight || 400, part.fontWeight || 400);
      prev.fontStyle = prev.fontStyle === "italic" || part.fontStyle === "italic" ? "italic" : "normal";
      continue;
    }
    merged.push({ ...part });
  }

  return merged
    .filter((item) => item.text.length > 1)
    .map((item) => ({
      id: crypto.randomUUID(),
      type: "text",
      x: item.x,
      y: item.y,
      width: item.width,
      height: Math.max(item.height, Math.round(item.fontSize * 1.35)),
      text: item.text,
      fontSize: item.fontSize,
      color: sampleTextColor(ctx, item.x, item.y, item.width, item.height),
      fontFamily: item.fontFamily || "Arial",
      fontWeight: item.fontWeight || 400,
      fontStyle: item.fontStyle || "normal",
      source: "pdf",
      inputName: "",
    }));
}

function detectPrimaryPhotoRect(canvas) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  if (!ctx || width < 120 || height < 120) {
    return null;
  }

  const step = 2;
  const sw = Math.max(1, Math.floor(width / step));
  const sh = Math.max(1, Math.floor(height / step));
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const integral = new Uint32Array((sw + 1) * (sh + 1));

  for (let y = 1; y <= sh; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= sw; x += 1) {
      const px = (x - 1) * step;
      const py = (y - 1) * step;
      const index = (py * width + px) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
      const isNonWhite = alpha > 12 && !(r > 244 && g > 244 && b > 244);
      rowSum += isNonWhite ? 1 : 0;
      integral[y * (sw + 1) + x] = integral[(y - 1) * (sw + 1) + x] + rowSum;
    }
  }

  function sumRect(x0, y0, w0, h0) {
    const x1 = x0 + w0;
    const y1 = y0 + h0;
    return integral[y1 * (sw + 1) + x1]
      - integral[y0 * (sw + 1) + x1]
      - integral[y1 * (sw + 1) + x0]
      + integral[y0 * (sw + 1) + x0];
  }

  let best = null;
  const candidateWidths = [0.14, 0.18, 0.22, 0.26, 0.3].map((f) => Math.max(24, Math.floor(sw * f)));

  for (const cw of candidateWidths) {
    for (const ratio of [1.2, 1.35, 1.5]) {
      const ch = Math.max(24, Math.floor(cw * ratio));
      const yStart = Math.floor(sh * 0.03);
      const yEnd = Math.floor(sh * 0.62);
      const xEnd = Math.max(1, sw - cw - 1);
      for (let y = yStart; y <= yEnd; y += Math.max(2, Math.floor(sh * 0.03))) {
        for (let x = 1; x <= xEnd; x += Math.max(2, Math.floor(sw * 0.03))) {
          const area = cw * ch;
          const filled = sumRect(x, y, cw, ch);
          const density = filled / area;
          if (density < 0.32) {
            continue;
          }
          const centerPenalty = Math.abs((x + cw / 2) - sw / 2) / sw;
          const score = density - centerPenalty * 0.12;
          if (!best || score > best.score) {
            best = { score, x, y, width: cw, height: ch };
          }
        }
      }
    }
  }

  if (!best) {
    return null;
  }
  return {
    x: clamp(Math.floor(best.x * step), 0, width - 1),
    y: clamp(Math.floor(best.y * step), 0, height - 1),
    width: clamp(Math.floor(best.width * step), 24, width),
    height: clamp(Math.floor(best.height * step), 24, height),
  };
}

function clonePagesSnapshot(items) {
  return (items || []).map((page) => ({
    ...page,
    elements: (page.elements || []).map((item) => ({ ...item })),
  }));
}

async function renderPdfPreviewPages(file, maxPages = 2) {
  const buffer = await file.arrayBuffer();
  await ensurePdfWorkerReady();
  const loadOptions = {
    data: new Uint8Array(buffer),
    stopAtErrors: true,
    isEvalSupported: false,
  };
  let pdf = null;
  let firstError = null;
  try {
    pdf = await pdfjsLib.getDocument(loadOptions).promise;
  } catch (error) {
    firstError = error;
  }

  // Fallback: force a dedicated in-process worker instance.
  if (!pdf) {
    try {
      const fallbackWorker = new pdfjsLib.PDFWorker({ name: "wzid-fallback" });
      pdf = await pdfjsLib.getDocument({ ...loadOptions, worker: fallbackWorker }).promise;
    } catch (fallbackError) {
      const primaryMessage = String(firstError?.message || firstError || "worker_load_failed");
      const fallbackMessage = String(fallbackError?.message || fallbackError || "fallback_failed");
      throw new Error(`Unable to render PDF preview. ${primaryMessage}; ${fallbackMessage}`);
    }
  }
  const count = Math.min(pdf.numPages, maxPages);
  const pages = [];

  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const textElements = await detectPdfTextElements(page, viewport, context, canvas.width, canvas.height);
    const imageRect = detectPrimaryPhotoRect(canvas);
    const imageElements = imageRect ? [{
      id: crypto.randomUUID(),
      type: "image",
      x: imageRect.x,
      y: imageRect.y,
      width: imageRect.width,
      height: imageRect.height,
      imageDataUrl: createCoverCropDataUrl(canvas, imageRect),
      fit: "cover",
      source: "pdf",
      role: "employee_photo",
    }] : [];

    pages.push({
      id: crypto.randomUUID(),
      label: `Page ${pageNumber}`,
      width: canvas.width,
      height: canvas.height,
      backgroundDataUrl: canvas.toDataURL("image/png", 1),
      elements: [...imageElements, ...textElements],
    });
  }

  return pages;
}

function drawTextElement(ctx, element) {
  const value = String(element?.text || "");
  if (!value.trim()) {
    return;
  }
  const lines = value.split(/\r?\n/);
  const fontSize = Math.max(8, Number(element?.fontSize || 20));
  const lineHeight = fontSize * 1.2;
  const maxLines = Math.max(1, Math.floor((element?.height || fontSize * 1.4) / lineHeight));
  for (let lineIndex = 0; lineIndex < Math.min(lines.length, maxLines); lineIndex += 1) {
    ctx.fillText(lines[lineIndex], element.x, element.y + lineIndex * lineHeight);
  }
}

function drawImageCover(ctx, image, x, y, width, height) {
  const frameRatio = width / height;
  const imageRatio = image.width / image.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(
    image,
    Math.floor(sourceX),
    Math.floor(sourceY),
    Math.floor(sourceWidth),
    Math.floor(sourceHeight),
    x,
    y,
    width,
    height,
  );
}

function getEmployeePhotoElement(page) {
  return (page?.elements || []).find((item) => item.type === "image" && item.role === "employee_photo") || null;
}

export default function IdCardStudioPanel() {
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFilePath, setUploadFilePath] = useState("");
  const [dragPageId, setDragPageId] = useState("");
  const [dragState, setDragState] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [editorEnabled, setEditorEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const [pageMenu, setPageMenu] = useState({ open: false, x: 0, y: 0, pageId: "" });
  const [inlineTextEdit, setInlineTextEdit] = useState({ pageId: "", elementId: "" });
  const [pendingPhotoSlotPageId, setPendingPhotoSlotPageId] = useState("");
  const [excelColumns, setExcelColumns] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [photoColumn, setPhotoColumn] = useState("");
  const [imageFolderName, setImageFolderName] = useState("");
  const [batchFormat, setBatchFormat] = useState("pdf");
  const imageFileMapRef = useRef(new Map());
  const imageDataCacheRef = useRef(new Map());

  const pageRefs = useRef(new Map());
  const quickReplaceInputRef = useRef(null);
  const [quickReplaceTarget, setQuickReplaceTarget] = useState({ pageId: "", elementId: "" });
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const ignoreHistoryRef = useRef(false);
  const previousPagesRef = useRef(pages);

  const selectedPage = useMemo(
    () => pages.find((item) => item.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  const selectedElement = useMemo(
    () => selectedPage?.elements?.find((item) => item.id === selectedElementId) || null,
    [selectedElementId, selectedPage]
  );
  const selectedPageEmployeePhoto = useMemo(
    () => getEmployeePhotoElement(selectedPage),
    [selectedPage]
  );
  const selectedPageMappedFields = useMemo(
    () => (selectedPage?.elements || []).filter((item) => item.type === "text" && String(item.inputName || "").trim()),
    [selectedPage]
  );
  const templateMappedFields = useMemo(() => {
    const keys = new Set();
    for (const page of pages) {
      for (const element of page.elements || []) {
        if (element.type !== "text") {
          continue;
        }
        const key = String(element.inputName || "").trim();
        if (key) {
          keys.add(key);
        }
      }
    }
    return Array.from(keys);
  }, [pages]);

  useEffect(() => {
    if (!pageMenu.open) {
      return undefined;
    }
    function handleClose() {
      setPageMenu({ open: false, x: 0, y: 0, pageId: "" });
    }
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [pageMenu.open]);

  useEffect(() => {
    if (ignoreHistoryRef.current) {
      ignoreHistoryRef.current = false;
      previousPagesRef.current = clonePagesSnapshot(pages);
      return;
    }
    if (previousPagesRef.current !== pages) {
      historyPastRef.current.push(clonePagesSnapshot(previousPagesRef.current));
      if (historyPastRef.current.length > 80) {
        historyPastRef.current.shift();
      }
      historyFutureRef.current = [];
      previousPagesRef.current = clonePagesSnapshot(pages);
    }
  }, [pages]);

  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFutureRef.current.length > 0;

  function performUndo() {
    if (!historyPastRef.current.length) {
      return;
    }
    const previous = historyPastRef.current.pop();
    historyFutureRef.current.push(clonePagesSnapshot(pages));
    ignoreHistoryRef.current = true;
    setPages(clonePagesSnapshot(previous));
    setSelectedElementId("");
    setInlineTextEdit({ pageId: "", elementId: "" });
    setMessage("Undo applied.");
  }

  function performRedo() {
    if (!historyFutureRef.current.length) {
      return;
    }
    const next = historyFutureRef.current.pop();
    historyPastRef.current.push(clonePagesSnapshot(pages));
    ignoreHistoryRef.current = true;
    setPages(clonePagesSnapshot(next));
    setSelectedElementId("");
    setInlineTextEdit({ pageId: "", elementId: "" });
    setMessage("Redo applied.");
  }

  function applyPagePatch(pageId, patcher) {
    setPages((current) => current.map((page) => (page.id === pageId ? patcher(page) : page)));
  }

  async function handleDesignUpload(event) {
    try {
      setError("");
      setMessage("");
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const fileName = String(file.name || "design");
      const isPdf = fileName.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const sourcePath = String(file.path || "").trim();

      let nextPages = [];
      if (isPdf) {
        nextPages = await renderPdfPreviewPages(file, 2);
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        const image = await loadImage(dataUrl);
        nextPages = [{
          id: crypto.randomUUID(),
          label: "Page 1",
          width: image.width,
          height: image.height,
          backgroundDataUrl: dataUrl,
          elements: [],
        }];
      }

      if (!nextPages.length) {
        throw new Error("No preview pages were generated from this file.");
      }

      setPages(nextPages);
      historyPastRef.current = [];
      historyFutureRef.current = [];
      previousPagesRef.current = nextPages;
      setSelectedPageId(nextPages[0].id);
      setSelectedElementId("");
      setEditorEnabled(false);
      setUploadName(fileName);
      setUploadFilePath(sourcePath);
      setMessage(`Loaded ${nextPages.length} page(s). Enable Editor Mode to edit text/image layers.`);
    } catch (uploadError) {
      setError(String(uploadError?.message || "Unable to load design preview."));
    }
  }

  async function replaceSelectedImage(event) {
    try {
      if (!selectedPage || !selectedElement || selectedElement.type !== "image") {
        return;
      }
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      applyPagePatch(selectedPage.id, (page) => ({
        ...page,
        elements: page.elements.map((item) => (
          item.id === selectedElement.id ? { ...item, imageDataUrl: dataUrl } : item
        )),
      }));
      setMessage("Image replaced for selected layer.");
      setError("");
    } catch (replaceError) {
      setError(String(replaceError?.message || "Unable to replace image."));
    }
  }

  function getPagePoint(pageId, event) {
    const page = pages.find((item) => item.id === pageId);
    const pageNode = pageRefs.current.get(pageId);
    if (!page || !pageNode) {
      return null;
    }
    const rect = pageNode.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    const x = ((event.clientX - rect.left) / rect.width) * page.width;
    const y = ((event.clientY - rect.top) / rect.height) * page.height;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
  }

  async function handleWorkspaceClick(pageId, event) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) {
      return;
    }
    setSelectedPageId(pageId);
    if (!editorEnabled) {
      return;
    }

    const point = getPagePoint(pageId, event);
    if (!point) {
      return;
    }

    if (pendingPhotoSlotPageId === page.id) {
      try {
        const slotWidth = 170;
        const slotHeight = 210;
        const slotX = clamp(Math.round(point.x - slotWidth / 2), 0, Math.max(0, page.width - slotWidth));
        const slotY = clamp(Math.round(point.y - slotHeight / 2), 0, Math.max(0, page.height - slotHeight));
        const previewCrop = createCoverCropDataUrl(
          await (async () => {
            const bg = await loadImage(page.backgroundDataUrl);
            const buffer = document.createElement("canvas");
            buffer.width = page.width;
            buffer.height = page.height;
            const bgCtx = buffer.getContext("2d");
            bgCtx.drawImage(bg, 0, 0, page.width, page.height);
            return buffer;
          })(),
          { x: slotX, y: slotY, width: slotWidth, height: slotHeight }
        );
        const element = {
          id: crypto.randomUUID(),
          type: "image",
          x: slotX,
          y: slotY,
          width: slotWidth,
          height: slotHeight,
          imageDataUrl: previewCrop,
          fit: "cover",
          role: "employee_photo",
        };
        applyPagePatch(page.id, (item) => ({
          ...item,
          elements: [
            ...item.elements.filter((entry) => !(entry.type === "image" && entry.role === "employee_photo")),
            element,
          ],
        }));
        setPendingPhotoSlotPageId("");
        setSelectedElementId(element.id);
        setMessage("Employee photo slot added. Double click the photo to replace.");
        setError("");
      } catch (photoSlotError) {
        setError(String(photoSlotError?.message || "Unable to tag employee photo."));
      }
      return;
    }
  }

  function startElementDrag(pageId, event, elementId) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) {
      return;
    }
    event.stopPropagation();
    const point = getPagePoint(pageId, event);
    if (!point) {
      return;
    }
    const element = page.elements.find((item) => item.id === elementId);
    if (!element) {
      return;
    }
    setSelectedPageId(pageId);
    setSelectedElementId(element.id);
    setDragState({
      pageId,
      elementId,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    });
  }

  function handleElementDrag(event) {
    if (!dragState) {
      return;
    }
    const page = pages.find((item) => item.id === dragState.pageId);
    if (!page) {
      return;
    }
    const point = getPagePoint(dragState.pageId, event);
    if (!point) {
      return;
    }
    const nextX = Math.max(0, Math.round(point.x - dragState.offsetX));
    const nextY = Math.max(0, Math.round(point.y - dragState.offsetY));

    applyPagePatch(page.id, (item) => ({
      ...item,
      elements: item.elements.map((entry) => (
        entry.id === dragState.elementId ? { ...entry, x: nextX, y: nextY } : entry
      )),
    }));
  }

  function getDisplayWidth(page) {
    const baseWidth = Math.min(680, Math.max(260, Math.round(page.width * 0.62)));
    return Math.max(220, Math.round((baseWidth * zoom) / 100));
  }

  function setPageRef(pageId, node) {
    if (node) {
      pageRefs.current.set(pageId, node);
    } else {
      pageRefs.current.delete(pageId);
    }
  }

  function getOverlayEntries(page) {
    return (page?.elements || []).map((item) => ({
      ...item,
      leftPct: (item.x / page.width) * 100,
      topPct: (item.y / page.height) * 100,
      widthPct: (item.width / page.width) * 100,
      heightPct: (item.height / page.height) * 100,
    }));
  }

  function stopElementDrag() {
    setDragState(null);
  }

  function openPageContextMenu(pageId, event) {
    event.preventDefault();
    setSelectedPageId(pageId);
    setPageMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      pageId,
    });
  }

  function closeCurrentPdf() {
    setPages([]);
    historyPastRef.current = [];
    historyFutureRef.current = [];
    previousPagesRef.current = [];
    setSelectedPageId("");
    setSelectedElementId("");
    setUploadName("");
    setUploadFilePath("");
    setDragPageId("");
    setDragState(null);
    setPageMenu({ open: false, x: 0, y: 0, pageId: "" });
    setInlineTextEdit({ pageId: "", elementId: "" });
    setQuickReplaceTarget({ pageId: "", elementId: "" });
    setPendingPhotoSlotPageId("");
    setExcelColumns([]);
    setExcelRows([]);
    setExcelFileName("");
    setPhotoColumn("");
    setImageFolderName("");
    imageFileMapRef.current = new Map();
    imageDataCacheRef.current = new Map();
    setEditorEnabled(false);
    setMessage("Current PDF closed.");
    setError("");
  }

  function deletePage(pageId) {
    if (!pageId) {
      return;
    }
    setPages((current) => {
      const next = current.filter((item) => item.id !== pageId);
      if (!next.length) {
        setSelectedPageId("");
        setUploadName("");
        setUploadFilePath("");
      } else if (!next.find((item) => item.id === selectedPageId)) {
        setSelectedPageId(next[0].id);
      }
      return next;
    });
    setSelectedElementId("");
    setInlineTextEdit({ pageId: "", elementId: "" });
    setPendingPhotoSlotPageId("");
    setPageMenu({ open: false, x: 0, y: 0, pageId: "" });
    setMessage("Page deleted.");
  }

  async function handleQuickReplaceImage(event, forcedTarget = null) {
    try {
      const file = event.target.files?.[0];
      const target = forcedTarget || quickReplaceTarget;
      const { pageId, elementId } = target;
      if (!file || !pageId) {
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (elementId) {
        applyPagePatch(pageId, (page) => ({
          ...page,
          elements: page.elements.map((item) => (
            item.id === elementId ? { ...item, imageDataUrl: dataUrl, fit: "cover" } : item
          )),
        }));
        setSelectedPageId(pageId);
        setSelectedElementId(elementId);
        setMessage("Photo replaced.");
      }
      setError("");
    } catch (replaceError) {
      setError(String(replaceError?.message || "Unable to replace selected image."));
    } finally {
      if (event.target) {
        event.target.value = "";
      }
      setQuickReplaceTarget({ pageId: "", elementId: "" });
    }
  }

  function getRowValue(row, key) {
    if (!row || !key) {
      return "";
    }
    const direct = row[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
      return String(direct);
    }
    const target = normalizeFieldKey(key);
    for (const column of Object.keys(row)) {
      if (normalizeFieldKey(column) === target) {
        const value = row[column];
        if (value !== undefined && value !== null) {
          return String(value);
        }
      }
    }
    return "";
  }

  async function handleExcelUpload(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames?.[0];
      if (!sheetName) {
        throw new Error("No sheet found in Excel file.");
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      const columns = rows.length ? Object.keys(rows[0]) : [];
      setExcelRows(rows);
      setExcelColumns(columns);
      setExcelFileName(file.name || "sheet.xlsx");
      if (columns.length) {
        const preferred = columns.find((item) => normalizeFieldKey(item).includes("image"))
          || columns.find((item) => normalizeFieldKey(item).includes("photo"))
          || columns[0];
        setPhotoColumn(preferred || "");
      } else {
        setPhotoColumn("");
      }
      setMessage(`Excel loaded: ${rows.length} row(s).`);
      setError("");
    } catch (excelError) {
      setError(String(excelError?.message || "Unable to read Excel file."));
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  function handleImageFolderUpload(event) {
    const files = Array.from(event.target.files || []);
    const next = new Map();
    for (const file of files) {
      const name = String(file.name || "").trim();
      if (!name) {
        continue;
      }
      next.set(normalizeKey(name), file);
      const dot = name.lastIndexOf(".");
      if (dot > 0) {
        next.set(normalizeKey(name.slice(0, dot)), file);
      }
    }
    imageFileMapRef.current = next;
    imageDataCacheRef.current = new Map();
    const folderPath = files[0]?.webkitRelativePath || "";
    const folderName = folderPath ? folderPath.split("/")[0] : "";
    setImageFolderName(folderName || (files.length ? "Selected" : ""));
    setMessage(`Image folder loaded: ${files.length} file(s).`);
    setError("");
    if (event.target) {
      event.target.value = "";
    }
  }

  async function resolvePhotoDataUrlForRow(row) {
    const source = getRowValue(row, photoColumn);
    const token = String(source || "").trim();
    if (!token) {
      return "";
    }
    const key = normalizeKey(token.replace(/\\/g, "/").split("/").pop() || token);
    const baseKey = key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : key;
    const file = imageFileMapRef.current.get(key)
      || imageFileMapRef.current.get(baseKey);
    if (!file) {
      return "";
    }
    const cacheKey = normalizeKey(file.name || key);
    if (imageDataCacheRef.current.has(cacheKey)) {
      return imageDataCacheRef.current.get(cacheKey) || "";
    }
    const dataUrl = await readFileAsDataUrl(file);
    imageDataCacheRef.current.set(cacheKey, dataUrl);
    return dataUrl;
  }

  async function buildPagesForRow(row) {
    const photoDataUrl = await resolvePhotoDataUrlForRow(row);
    return pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (element.type === "text") {
          const key = String(element.inputName || "").trim();
          if (key) {
            return { ...element, text: getRowValue(row, key) };
          }
        }
        if (element.type === "image" && element.role === "employee_photo" && photoDataUrl) {
          return { ...element, imageDataUrl: photoDataUrl, fit: "cover" };
        }
        return { ...element };
      }),
    }));
  }

  async function exportBatch() {
    try {
      if (!pages.length) {
        throw new Error("Upload template PDF first.");
      }
      if (!excelRows.length) {
        throw new Error("Upload Excel data before batch export.");
      }
      if (!templateMappedFields.length) {
        throw new Error("Map at least one text field using Input Name.");
      }
      setBatchExporting(true);
      setError("");
      setMessage("");
      const zip = new JSZip();

      for (let rowIndex = 0; rowIndex < excelRows.length; rowIndex += 1) {
        const row = excelRows[rowIndex];
        const rowPages = await buildPagesForRow(row);
        const rowName = getRowValue(row, "employee_name")
          || getRowValue(row, "name")
          || `member_${rowIndex + 1}`;
        const safeRow = sanitizeFileName(rowName, `member_${rowIndex + 1}`);

        if (batchFormat === "pdf") {
          const first = rowPages[0];
          const doc = new jsPDF({
            orientation: first.width >= first.height ? "landscape" : "portrait",
            unit: "px",
            format: [first.width, first.height],
          });
          for (let pageIndex = 0; pageIndex < rowPages.length; pageIndex += 1) {
            const page = rowPages[pageIndex];
            const canvas = await renderPageCanvas(page);
            const imageData = canvas.toDataURL("image/jpeg", 0.96);
            if (pageIndex > 0) {
              doc.addPage([page.width, page.height], page.width >= page.height ? "landscape" : "portrait");
            }
            doc.addImage(imageData, "JPEG", 0, 0, page.width, page.height);
          }
          const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
          zip.file(`${safeRow}.pdf`, pdfBytes);
        } else {
          for (let pageIndex = 0; pageIndex < rowPages.length; pageIndex += 1) {
            const page = rowPages[pageIndex];
            const canvas = await renderPageCanvas(page);
            const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
            zip.file(`${safeRow}-p${pageIndex + 1}.jpg`, base64, { base64: true });
          }
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = batchFormat === "pdf" ? "id-cards-batch-pdf.zip" : "id-cards-batch-jpg.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Batch export completed: ${excelRows.length} record(s).`);
    } catch (batchError) {
      setError(String(batchError?.message || "Unable to export batch files."));
    } finally {
      setBatchExporting(false);
    }
  }

  function updateSelectedElement(patch) {
    if (!selectedPage || !selectedElement) {
      return;
    }
    applyPagePatch(selectedPage.id, (page) => ({
      ...page,
      elements: page.elements.map((item) => (
        item.id === selectedElement.id ? { ...item, ...patch } : item
      )),
    }));
  }

  function deleteSelectedElement() {
    if (!selectedPage || !selectedElement) {
      return;
    }
    applyPagePatch(selectedPage.id, (page) => ({
      ...page,
      elements: page.elements.filter((item) => item.id !== selectedElement.id),
    }));
    setSelectedElementId("");
    setMessage("Selected layer removed.");
  }

  function duplicatePage(pageId) {
    const source = pages.find((item) => item.id === pageId);
    if (!source) {
      return;
    }
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      label: `${source.label} Copy`,
      elements: source.elements.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };

    setPages((current) => {
      const sourceIndex = current.findIndex((item) => item.id === pageId);
      if (sourceIndex < 0) {
        return [...current, copy];
      }
      const next = [...current];
      next.splice(sourceIndex + 1, 0, copy);
      return next;
    });

    setSelectedPageId(copy.id);
    setSelectedElementId("");
    setMessage("Page duplicated.");
    setPageMenu({ open: false, x: 0, y: 0, pageId: "" });
  }

  function addBlankPageAfter(pageId) {
    const referencePage = pages.find((item) => item.id === pageId) || pages[pages.length - 1] || null;
    const blank = createBlankPage({
      label: `Page ${pages.length + 1}`,
      width: referencePage?.width || 720,
      height: referencePage?.height || 1040,
    });
    setPages((current) => {
      if (!current.length) {
        return [blank];
      }
      const sourceIndex = current.findIndex((item) => item.id === pageId);
      if (sourceIndex < 0) {
        return [...current, blank];
      }
      const next = [...current];
      next.splice(sourceIndex + 1, 0, blank);
      return next;
    });
    setSelectedPageId(blank.id);
    setSelectedElementId("");
    setMessage("Blank page added.");
    setPageMenu({ open: false, x: 0, y: 0, pageId: "" });
  }

  async function replacePageBackground(event) {
    try {
      if (!selectedPage) {
        return;
      }
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      applyPagePatch(selectedPage.id, (page) => ({
        ...page,
        width: image.width,
        height: image.height,
        backgroundDataUrl: dataUrl,
      }));
      setSelectedElementId("");
      setMessage("Page background replaced.");
      setError("");
    } catch (replaceError) {
      setError(String(replaceError?.message || "Unable to replace page image."));
    }
  }

  function reorderPages(fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }

    setPages((current) => {
      const sourceIndex = current.findIndex((item) => item.id === fromId);
      const targetIndex = current.findIndex((item) => item.id === toId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  async function renderPageCanvas(page) {
    const canvas = document.createElement("canvas");
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext("2d");

    const background = await loadImage(page.backgroundDataUrl);
    ctx.drawImage(background, 0, 0, page.width, page.height);

    for (const element of page.elements) {
      if (element.type === "image" && element.imageDataUrl) {
        const image = await loadImage(element.imageDataUrl);
        if (element.fit === "cover") {
          drawImageCover(ctx, image, element.x, element.y, element.width, element.height);
        } else {
          ctx.drawImage(image, element.x, element.y, element.width, element.height);
        }
      }
      if (element.type === "text") {
        ctx.fillStyle = element.color || "#0f172a";
        ctx.font = `${element.fontStyle || "normal"} ${element.fontWeight || 400} ${element.fontSize || 20}px ${element.fontFamily || "Arial"}`;
        ctx.textBaseline = "top";
        drawTextElement(ctx, element);
      }
    }

    return canvas;
  }

  async function savePdf() {
    try {
      setExporting(true);
      setError("");
      setMessage("");

      if (!pages.length) {
        throw new Error("Upload a PDF or image before saving.");
      }

      const first = pages[0];
      const firstOrientation = first.width >= first.height ? "landscape" : "portrait";
      const doc = new jsPDF({
        orientation: firstOrientation,
        unit: "px",
        format: [first.width, first.height],
      });

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const canvas = await renderPageCanvas(page);
        const imageData = canvas.toDataURL("image/jpeg", 0.96);

        if (index > 0) {
          const pageOrientation = page.width >= page.height ? "landscape" : "portrait";
          doc.addPage([page.width, page.height], pageOrientation);
        }

        doc.addImage(imageData, "JPEG", 0, 0, page.width, page.height);
      }

      const fileName = uploadName && uploadName.toLowerCase().endsWith(".pdf")
        ? uploadName
        : "id-card-edited.pdf";
      const output = doc.output("arraybuffer");
      if (window.storageApi?.saveFileBytes) {
        const result = await window.storageApi.saveFileBytes({
          bytes: new Uint8Array(output),
          targetPath: uploadFilePath && uploadFilePath.toLowerCase().endsWith(".pdf") ? uploadFilePath : "",
          defaultFileName: fileName,
          title: uploadFilePath ? "Save PDF" : "Save PDF As",
          filters: [{ name: "PDF Files", extensions: ["pdf"] }],
        });
        if (!result?.ok) {
          if (result?.cancelled) {
            setMessage("Save cancelled.");
            return;
          }
          throw new Error(result?.error || "Unable to save PDF file.");
        }
        setMessage(`PDF saved: ${result.path}`);
        if (result.path) {
          setUploadFilePath(result.path);
        }
      } else {
        doc.save(fileName);
        setMessage("PDF saved successfully.");
      }
    } catch (saveError) {
      setError(String(saveError?.message || "Unable to save PDF."));
    } finally {
      setExporting(false);
    }
  }

  async function exportImages() {
    try {
      setExporting(true);
      setError("");
      setMessage("");

      if (!pages.length) {
        throw new Error("Upload a PDF or image before export.");
      }

      const zip = new JSZip();
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const canvas = await renderPageCanvas(page);
        const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
        zip.file(`${sanitizeFileName(page.label, `page_${index + 1}`)}.jpg`, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "id-card-pages.zip";
      anchor.click();
      URL.revokeObjectURL(url);

      setMessage("Image export completed.");
    } catch (zipError) {
      setError(String(zipError?.message || "Unable to export images."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="imposition-panel wzid-root-panel">
      <div className="imposition-panel-heading">
        <h3>Card UPS Workspace</h3>
        <span>ID Card PDF Editor</span>
      </div>

      <div className="wzid-shell">
        <input
          ref={quickReplaceInputRef}
          type="file"
          accept=".png,.jpg,.jpeg"
          className="wzid-hidden-file-input"
          onChange={handleQuickReplaceImage}
        />
        <div className="wzid-center">
          <div className="wzid-toolbar">
            <label className="imposition-upload-field wzid-upload-btn">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleDesignUpload} />
              <span>{uploadName ? `Loaded: ${uploadName}` : "Upload PDF / Image"}</span>
            </label>
            <div className="wzid-toolbar-actions">
              <button type="button" className="btn btn-secondary" onClick={performUndo} disabled={!canUndo || !pages.length}>
                Undo
              </button>
              <button type="button" className="btn btn-secondary" onClick={performRedo} disabled={!canRedo || !pages.length}>
                Redo
              </button>
              <button
                type="button"
                className={`btn ${editorEnabled ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  setEditorEnabled((current) => {
                    const next = !current;
                    setMessage(next ? "Editor mode enabled." : "Editor mode disabled.");
                    return next;
                  });
                }}
              >
                {editorEnabled ? "Disable Editor Mode" : "Enable Editor Mode"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeCurrentPdf} disabled={!pages.length}>
                Close Current PDF
              </button>
            </div>
            <div className="wzid-zoom-group">
              {ZOOM_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`imposition-toolbar-chip ${zoom === value ? "active" : ""}`}
                  onClick={() => setZoom(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>

          {pages.length ? (
            <div className="wzid-scroll-view" onMouseMove={handleElementDrag} onMouseUp={stopElementDrag} onMouseLeave={stopElementDrag}>
              <div className="wzid-page-stack">
                {pages.map((page) => {
                  const overlays = getOverlayEntries(page);
                  return (
                    <article
                      key={page.id}
                      className={`wzid-page-canvas-shell ${selectedPageId === page.id ? "active" : ""}`}
                      onContextMenu={(event) => openPageContextMenu(page.id, event)}
                    >
                      <header className="wzid-page-canvas-head">{page.label}</header>
                      <div
                        ref={(node) => setPageRef(page.id, node)}
                        className="wzid-workspace wzid-page-canvas"
                        style={{
                          backgroundImage: `url(${page.backgroundDataUrl})`,
                          aspectRatio: `${page.width} / ${page.height}`,
                          width: `${getDisplayWidth(page)}px`,
                        }}
                        onClick={(event) => {
                          setInlineTextEdit({ pageId: "", elementId: "" });
                          setSelectedElementId("");
                          handleWorkspaceClick(page.id, event);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${page.label} editor workspace`}
                      >
                        {editorEnabled && selectedPageId === page.id ? overlays.map((item) => (
                          <div
                            key={item.id}
                            className={`idcard-overlay idcard-overlay-${item.type} ${selectedElementId === item.id ? "active" : ""}`}
                            style={{
                              left: `${item.leftPct}%`,
                              top: `${item.topPct}%`,
                              width: `${item.widthPct}%`,
                              height: `${item.heightPct}%`,
                            }}
                            onMouseDown={(event) => startElementDrag(page.id, event, item.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!editorEnabled) {
                                return;
                              }
                              setSelectedPageId(page.id);
                              setSelectedElementId(item.id);
                              setInlineTextEdit({ pageId: "", elementId: "" });
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              if (item.type === "text" && editorEnabled) {
                                setInlineTextEdit({ pageId: page.id, elementId: item.id });
                              }
                              if (item.type === "image" && editorEnabled && quickReplaceInputRef.current) {
                                setQuickReplaceTarget({ pageId: page.id, elementId: item.id });
                                quickReplaceInputRef.current.click();
                              }
                            }}
                          >
                            {item.type === "image" ? (
                              <img
                                src={item.imageDataUrl}
                                alt="Layer"
                                className="idcard-overlay-image"
                              />
                            ) : null}
                            {item.type === "text" ? (
                              inlineTextEdit.pageId === page.id && inlineTextEdit.elementId === item.id ? (
                                <textarea
                                  className="idcard-inline-text-editor"
                                  autoFocus
                                  value={item.text || ""}
                                  style={{
                                    fontSize: `${item.fontSize || 20}px`,
                                    fontFamily: item.fontFamily || "Arial",
                                    fontWeight: item.fontWeight || 400,
                                    fontStyle: item.fontStyle || "normal",
                                    color: item.color || "#0f172a",
                                  }}
                                  onChange={(event) => {
                                    applyPagePatch(page.id, (pageItem) => ({
                                      ...pageItem,
                                      elements: pageItem.elements.map((entry) => (
                                        entry.id === item.id ? { ...entry, text: event.target.value } : entry
                                      )),
                                    }));
                                  }}
                                  onBlur={() => setInlineTextEdit({ pageId: "", elementId: "" })}
                                />
                              ) : (
                                <span
                                  className="idcard-overlay-text"
                                  style={{
                                    fontSize: `${item.fontSize || 20}px`,
                                    fontFamily: item.fontFamily || "Arial",
                                    fontWeight: item.fontWeight || 400,
                                    fontStyle: item.fontStyle || "normal",
                                    color: item.color || "#0f172a",
                                  }}
                                >
                                  {item.text}
                                </span>
                              )
                            ) : null}
                          </div>
                        )) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="wzid-empty-workspace">
              Upload a PDF to preview 1-2 pages and start editing.
            </div>
          )}
        </div>

        <aside className="wzid-right">
          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Tools</h3>
              <span>Manual editing</span>
            </div>
            <div className="wzid-tool-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!editorEnabled || !selectedPage}
                onClick={() => {
                  if (!selectedPage) {
                    return;
                  }
                  const element = createTextElement({
                    x: Math.round(selectedPage.width * 0.2),
                    y: Math.round(selectedPage.height * 0.2),
                  });
                  applyPagePatch(selectedPage.id, (page) => ({ ...page, elements: [...page.elements, element] }));
                  setSelectedElementId(element.id);
                  setInlineTextEdit({ pageId: selectedPage.id, elementId: element.id });
                  setMessage("Text box added.");
                }}
              >
                Add Text Box
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${pendingPhotoSlotPageId ? "is-active" : ""}`}
                disabled={!editorEnabled || !selectedPage}
                onClick={() => {
                  if (!selectedPage) {
                    return;
                  }
                  const next = pendingPhotoSlotPageId === selectedPage.id ? "" : selectedPage.id;
                  setPendingPhotoSlotPageId(next);
                  setMessage(next ? "Click workspace to tag employee photo area." : "Employee photo tagging cancelled.");
                }}
              >
                Tag Employee Photo
              </button>
            </div>
            {selectedPageEmployeePhoto ? (
              <label className="imposition-field">
                <span>Replace Employee Photo</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={(event) => {
                    handleQuickReplaceImage(event, { pageId: selectedPage.id, elementId: selectedPageEmployeePhoto.id });
                  }}
                  disabled={!editorEnabled}
                />
              </label>
            ) : (
              <div className="imposition-muted-copy">Employee photo not detected. Click `Tag Employee Photo`, then click the photo area in the page.</div>
            )}
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Pages</h3>
              <span>Duplicate and reorder</span>
            </div>
            <div className="wzid-tool-row">
              <button type="button" className="btn btn-secondary" onClick={() => addBlankPageAfter(selectedPageId || pages[pages.length - 1]?.id || "")} disabled={!pages.length}>
                New Blank Page
              </button>
            </div>
            <div className="wzid-page-list">
              {pages.length === 0 ? (
                <div className="imposition-muted-copy">No pages loaded.</div>
              ) : (
                pages.map((page) => (
                  <article
                    key={page.id}
                    className={`wzid-page-item ${selectedPageId === page.id ? "active" : ""}`}
                    draggable
                    onContextMenu={(event) => openPageContextMenu(page.id, event)}
                    onDragStart={() => setDragPageId(page.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      reorderPages(dragPageId, page.id);
                      setDragPageId("");
                    }}
                  >
                    <button type="button" className="wzid-page-select" onClick={() => { setSelectedPageId(page.id); setSelectedElementId(""); }}>
                      {page.label}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => duplicatePage(page.id)}>Duplicate</button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Element Editor</h3>
              <span>Text and image properties</span>
            </div>
            {selectedPage ? (
              <label className="imposition-field">
                <span>Replace Page Image</span>
                <input type="file" accept=".png,.jpg,.jpeg" onChange={replacePageBackground} />
              </label>
            ) : null}
            {selectedElement ? (
              <div className="imposition-form-grid imposition-form-grid-tight">
                {selectedElement.type === "text" ? (
                  <>
                    <label className="imposition-field">
                      <span>Input Name (Excel Column)</span>
                      <input
                        placeholder="employee_name"
                        value={selectedElement.inputName || ""}
                        onChange={(event) => updateSelectedElement({ inputName: event.target.value })}
                      />
                    </label>
                    <label className="imposition-field">
                      <span>Input Value</span>
                      <input value={selectedElement.text || ""} onChange={(event) => updateSelectedElement({ text: event.target.value })} />
                    </label>
                    <label className="imposition-field">
                      <span>Font Size</span>
                      <input type="number" value={selectedElement.fontSize || 20} onChange={(event) => updateSelectedElement({ fontSize: Number(event.target.value) })} />
                    </label>
                  </>
                ) : (
                  <label className="imposition-field">
                    <span>Replace Image</span>
                    <input type="file" accept=".png,.jpg,.jpeg" onChange={replaceSelectedImage} />
                  </label>
                )}
                <label className="imposition-field">
                  <span>Width</span>
                  <input type="number" value={selectedElement.width} onChange={(event) => updateSelectedElement({ width: Number(event.target.value) })} />
                </label>
                <label className="imposition-field">
                  <span>Height</span>
                  <input type="number" value={selectedElement.height} onChange={(event) => updateSelectedElement({ height: Number(event.target.value) })} />
                </label>
                <button type="button" className="btn btn-secondary" onClick={deleteSelectedElement}>Delete Layer</button>
                {selectedElement.type === "image" ? (
                  <button
                    type="button"
                    className={`btn btn-secondary ${selectedElement.role === "employee_photo" ? "is-active" : ""}`}
                    onClick={() => updateSelectedElement({ role: "employee_photo" })}
                  >
                    Mark as Employee Photo
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="imposition-muted-copy">Select a layer to edit details.</div>
            )}
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Dynamic Fields</h3>
              <span>Excel mapping</span>
            </div>
            {selectedPageMappedFields.length ? (
              <div className="wzid-field-list">
                {selectedPageMappedFields.map((entry) => (
                  <div key={entry.id} className="wzid-field-item">
                    <strong>{entry.inputName}</strong>
                    <span>{entry.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="imposition-muted-copy">Select a text layer and set `Input Name` to map this template field.</div>
            )}
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Bulk Data</h3>
              <span>ID card automation</span>
            </div>
            <div className="imposition-muted-copy">
              Mapped fields: {templateMappedFields.length ? templateMappedFields.join(", ") : "None"}
            </div>
            <label className="imposition-field">
              <span>Import Excel</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
            </label>
            <div className="imposition-muted-copy">
              {excelFileName ? `${excelFileName} (${excelRows.length} rows)` : "No Excel file loaded."}
            </div>
            <label className="imposition-field">
              <span>Photo Column</span>
              <select value={photoColumn} onChange={(event) => setPhotoColumn(event.target.value)} disabled={!excelColumns.length}>
                <option value="">Select column</option>
                {excelColumns.map((column) => (
                  <option key={column} value={column}>{column}</option>
                ))}
              </select>
            </label>
            <label className="imposition-field">
              <span>Select Image Folder</span>
              <input type="file" accept=".png,.jpg,.jpeg" multiple webkitdirectory="true" directory="" onChange={handleImageFolderUpload} />
            </label>
            <div className="imposition-muted-copy">
              {imageFolderName ? `Image folder: ${imageFolderName}` : "No image folder selected."}
            </div>
            <label className="imposition-field">
              <span>Batch Output</span>
              <select value={batchFormat} onChange={(event) => setBatchFormat(event.target.value)}>
                <option value="pdf">PDF (per member)</option>
                <option value="jpg">JPG (per page)</option>
              </select>
            </label>
            <div className="wzid-tool-row">
              <button type="button" className="btn btn-primary" onClick={exportBatch} disabled={batchExporting}>
                {batchExporting ? "Generating..." : "Generate Batch"}
              </button>
            </div>
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Export</h3>
              <span>PDF and images</span>
            </div>
            <div className="wzid-tool-row">
              <button type="button" className="btn btn-primary" onClick={savePdf} disabled={exporting}>Save PDF</button>
              <button type="button" className="btn btn-secondary" onClick={exportImages} disabled={exporting}>Export Images</button>
            </div>
          </section>
        </aside>
      </div>

      {pageMenu.open ? (
        <div className="wzid-context-menu" style={{ left: `${pageMenu.x}px`, top: `${pageMenu.y}px` }} role="menu">
          <button type="button" className="wzid-context-btn" onClick={() => duplicatePage(pageMenu.pageId)}>
            Duplicate Page
          </button>
          <button type="button" className="wzid-context-btn" onClick={() => addBlankPageAfter(pageMenu.pageId)}>
            Add Blank Page
          </button>
          <button type="button" className="wzid-context-btn is-danger" onClick={() => deletePage(pageMenu.pageId)}>
            Delete Page
          </button>
          <button type="button" className="wzid-context-btn is-danger" onClick={closeCurrentPdf}>
            Close Current PDF
          </button>
        </div>
      ) : null}

      {message ? <div className="alert alert-info mt-3">{message}</div> : null}
      {error ? <div className="alert alert-danger mt-3">{error}</div> : null}
    </section>
  );
}
