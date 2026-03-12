import { useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const ZOOM_OPTIONS = [50, 75, 100, 125, 150];

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
  };
}

function createImageElement({ x, y, imageDataUrl }) {
  return {
    id: crypto.randomUUID(),
    type: "image",
    x,
    y,
    width: 170,
    height: 210,
    imageDataUrl,
  };
}

async function renderPdfPreviewPages(file, maxPages = 2) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
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

    pages.push({
      id: crypto.randomUUID(),
      label: `Page ${pageNumber}`,
      width: canvas.width,
      height: canvas.height,
      backgroundDataUrl: canvas.toDataURL("image/png", 1),
      elements: [],
    });
  }

  return pages;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
  const value = String(text || "").trim();
  if (!value) {
    return;
  }

  const words = value.split(/\s+/);
  let line = "";
  let lineIndex = 0;

  for (let index = 0; index < words.length; index += 1) {
    const testLine = line ? `${line} ${words[index]}` : words[index];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      if ((lineIndex + 1) * lineHeight > maxHeight) {
        break;
      }
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = words[index];
      lineIndex += 1;
    } else {
      line = testLine;
    }
  }

  if ((lineIndex + 1) * lineHeight <= maxHeight) {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
  }
}

export default function IdCardStudioPanel() {
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("");
  const [activeTool, setActiveTool] = useState("select");
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [dragPageId, setDragPageId] = useState("");
  const [dragState, setDragState] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef(null);

  const selectedPage = useMemo(
    () => pages.find((item) => item.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  const selectedElement = useMemo(
    () => selectedPage?.elements?.find((item) => item.id === selectedElementId) || null,
    [selectedElementId, selectedPage]
  );

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
      setSelectedPageId(nextPages[0].id);
      setSelectedElementId("");
      setUploadName(fileName);
      setMessage(`Loaded ${nextPages.length} page(s). You can now edit manually.`);
    } catch (uploadError) {
      setError(String(uploadError?.message || "Unable to load design preview."));
    }
  }

  async function handleImageSourceUpload(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImageDataUrl(dataUrl);
      setMessage("Image source loaded. Click the workspace to place it.");
      setError("");
    } catch (imageError) {
      setError(String(imageError?.message || "Unable to load image source."));
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

  function getCanvasPoint(event) {
    if (!canvasRef.current || !selectedPage) {
      return null;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    const x = ((event.clientX - rect.left) / rect.width) * selectedPage.width;
    const y = ((event.clientY - rect.top) / rect.height) * selectedPage.height;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
  }

  function handleWorkspaceClick(event) {
    if (!selectedPage) {
      return;
    }

    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }

    if (activeTool === "text") {
      const element = createTextElement(point);
      applyPagePatch(selectedPage.id, (page) => ({ ...page, elements: [...page.elements, element] }));
      setSelectedElementId(element.id);
      setMessage("Text element added.");
      return;
    }

    if (activeTool === "image") {
      if (!pendingImageDataUrl) {
        setError("Choose an image source first.");
        return;
      }
      const element = createImageElement({ ...point, imageDataUrl: pendingImageDataUrl });
      applyPagePatch(selectedPage.id, (page) => ({ ...page, elements: [...page.elements, element] }));
      setSelectedElementId(element.id);
      setMessage("Image element added.");
    }
  }

  function startElementDrag(event, elementId) {
    if (!selectedPage) {
      return;
    }
    event.stopPropagation();
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    const element = selectedPage.elements.find((item) => item.id === elementId);
    if (!element) {
      return;
    }
    setSelectedElementId(element.id);
    setDragState({
      elementId,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    });
  }

  function handleElementDrag(event) {
    if (!selectedPage || !dragState) {
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    const nextX = Math.max(0, Math.round(point.x - dragState.offsetX));
    const nextY = Math.max(0, Math.round(point.y - dragState.offsetY));

    applyPagePatch(selectedPage.id, (page) => ({
      ...page,
      elements: page.elements.map((item) => (
        item.id === dragState.elementId ? { ...item, x: nextX, y: nextY } : item
      )),
    }));
  }

  function stopElementDrag() {
    setDragState(null);
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
        ctx.drawImage(image, element.x, element.y, element.width, element.height);
      }
      if (element.type === "text") {
        ctx.fillStyle = element.color || "#0f172a";
        ctx.font = `${element.fontSize || 20}px Arial`;
        ctx.textBaseline = "top";
        wrapText(
          ctx,
          element.text || "",
          element.x,
          element.y,
          element.width || 260,
          (element.fontSize || 20) + 4,
          element.height || 240
        );
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

      doc.save("id-card-edited.pdf");
      setMessage("PDF saved successfully.");
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

  const overlays = (selectedPage?.elements || []).map((item) => ({
    ...item,
    leftPct: (item.x / selectedPage.width) * 100,
    topPct: (item.y / selectedPage.height) * 100,
    widthPct: (item.width / selectedPage.width) * 100,
    heightPct: (item.height / selectedPage.height) * 100,
  }));

  return (
    <section className="imposition-panel wzid-root-panel">
      <div className="imposition-panel-heading">
        <h3>Card UPS Workspace</h3>
        <span>ID Card PDF Editor</span>
      </div>

      <div className="wzid-shell">
        <div className="wzid-center">
          <div className="wzid-toolbar">
            <label className="imposition-upload-field wzid-upload-btn">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleDesignUpload} />
              <span>{uploadName ? `Loaded: ${uploadName}` : "Upload PDF / Image"}</span>
            </label>
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

          {selectedPage ? (
            <div
              ref={canvasRef}
              className="wzid-workspace"
              style={{
                backgroundImage: `url(${selectedPage.backgroundDataUrl})`,
                aspectRatio: `${selectedPage.width} / ${selectedPage.height}`,
                width: `${zoom}%`,
              }}
              onClick={handleWorkspaceClick}
              onMouseMove={handleElementDrag}
              onMouseUp={stopElementDrag}
              onMouseLeave={stopElementDrag}
              role="button"
              tabIndex={0}
              aria-label="ID Card editor workspace"
            >
              {overlays.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`idcard-overlay ${selectedElementId === item.id ? "active" : ""}`}
                  style={{
                    left: `${item.leftPct}%`,
                    top: `${item.topPct}%`,
                    width: `${item.widthPct}%`,
                    height: `${item.heightPct}%`,
                  }}
                  onMouseDown={(event) => startElementDrag(event, item.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedElementId(item.id);
                  }}
                >
                  {item.type === "text" ? item.text : "Image"}
                </button>
              ))}
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
              <button type="button" className={`btn btn-secondary ${activeTool === "select" ? "is-active" : ""}`} onClick={() => setActiveTool("select")}>Select</button>
              <button type="button" className={`btn btn-secondary ${activeTool === "text" ? "is-active" : ""}`} onClick={() => setActiveTool("text")}>Text</button>
              <button type="button" className={`btn btn-secondary ${activeTool === "image" ? "is-active" : ""}`} onClick={() => setActiveTool("image")}>Image</button>
            </div>
            <label className="imposition-field">
              <span>Image Source</span>
              <input type="file" accept=".png,.jpg,.jpeg" onChange={handleImageSourceUpload} />
            </label>
          </section>

          <section className="wzid-card">
            <div className="imposition-panel-heading">
              <h3>Pages</h3>
              <span>Duplicate and reorder</span>
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
            {selectedElement ? (
              <div className="imposition-form-grid imposition-form-grid-tight">
                {selectedElement.type === "text" ? (
                  <>
                    <label className="imposition-field">
                      <span>Text</span>
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
              </div>
            ) : (
              <div className="imposition-muted-copy">Select a layer to edit details.</div>
            )}
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

      {message ? <div className="alert alert-info mt-3">{message}</div> : null}
      {error ? <div className="alert alert-danger mt-3">{error}</div> : null}
    </section>
  );
}
