import { useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed."));
    image.src = url;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed."));
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
    height: 42,
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
    width: 180,
    height: 220,
    imageDataUrl,
  };
}

async function renderPdfPreviewPages(file, maxPages = 2) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const pages = [];
  for (let index = 1; index <= count; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      id: crypto.randomUUID(),
      label: `Page ${index}`,
      backgroundDataUrl: canvas.toDataURL("image/png", 1),
      width: canvas.width,
      height: canvas.height,
      elements: [],
    });
  }
  return pages;
}

export default function IdCardStudioPanel() {
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("");
  const [activeTool, setActiveTool] = useState("select");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [dragPageId, setDragPageId] = useState("");
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const canvasRef = useRef(null);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  const selectedElement = useMemo(
    () => selectedPage?.elements?.find((item) => item.id === selectedElementId) || null,
    [selectedElementId, selectedPage]
  );

  function setPagePatch(pageId, patcher) {
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
      const name = String(file.name || "design");
      const lower = name.toLowerCase();
      let nextPages = [];
      if (lower.endsWith(".pdf") || file.type === "application/pdf") {
        nextPages = await renderPdfPreviewPages(file, 2);
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        const image = await loadImage(dataUrl);
        nextPages = [{
          id: crypto.randomUUID(),
          label: "Page 1",
          backgroundDataUrl: dataUrl,
          width: image.width,
          height: image.height,
          elements: [],
        }];
      }
      setPages(nextPages);
      setSelectedPageId(nextPages[0]?.id || "");
      setSelectedElementId("");
      setUploadName(name);
      setMessage(`Loaded ${nextPages.length} page preview for editing.`);
    } catch (uploadError) {
      setError(String(uploadError?.message || "Unable to load design."));
    }
  }

  async function handlePendingImage(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImageDataUrl(dataUrl);
      setMessage("Image ready. Click on preview to place it.");
      setError("");
    } catch (imageError) {
      setError(String(imageError?.message || "Unable to load image."));
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
      setPagePatch(selectedPage.id, (page) => ({
        ...page,
        elements: page.elements.map((item) => (
          item.id === selectedElement.id ? { ...item, imageDataUrl: dataUrl } : item
        )),
      }));
      setMessage("Image replaced for selected layer.");
      setError("");
    } catch (replaceError) {
      setError(String(replaceError?.message || "Image replace failed."));
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
      rect,
    };
  }

  function handleCanvasClick(event) {
    if (!selectedPage) {
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    if (activeTool === "text") {
      const next = createTextElement(point);
      setPagePatch(selectedPage.id, (page) => ({ ...page, elements: [...page.elements, next] }));
      setSelectedElementId(next.id);
      setMessage("Text element added.");
      return;
    }
    if (activeTool === "image") {
      if (!pendingImageDataUrl) {
        setError("Choose an image first, then click preview to place it.");
        return;
      }
      const next = createImageElement({ ...point, imageDataUrl: pendingImageDataUrl });
      setPagePatch(selectedPage.id, (page) => ({ ...page, elements: [...page.elements, next] }));
      setSelectedElementId(next.id);
      setMessage("Image element added.");
    }
  }

  function beginElementDrag(event, elementId) {
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
    setSelectedElementId(elementId);
    setDragState({
      elementId,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    });
  }

  function handleCanvasMouseMove(event) {
    if (!selectedPage || !dragState) {
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    const nextX = Math.max(0, Math.round(point.x - dragState.offsetX));
    const nextY = Math.max(0, Math.round(point.y - dragState.offsetY));
    setPagePatch(selectedPage.id, (page) => ({
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
    setPagePatch(selectedPage.id, (page) => ({
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
    setPagePatch(selectedPage.id, (page) => ({
      ...page,
      elements: page.elements.filter((item) => item.id !== selectedElement.id),
    }));
    setSelectedElementId("");
  }

  function duplicatePage(pageId) {
    const source = pages.find((page) => page.id === pageId);
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
      const sourceIndex = current.findIndex((page) => page.id === fromId);
      const targetIndex = current.findIndex((page) => page.id === toId);
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

    for (const item of page.elements) {
      if (item.type === "image" && item.imageDataUrl) {
        const image = await loadImage(item.imageDataUrl);
        ctx.drawImage(image, item.x, item.y, item.width, item.height);
      }
      if (item.type === "text") {
        ctx.fillStyle = item.color || "#0f172a";
        ctx.font = `${item.fontSize || 20}px Arial`;
        ctx.textBaseline = "top";
        wrapText(ctx, item.text || "", item.x, item.y, item.width || 260, (item.fontSize || 20) + 5, item.height || 200);
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
        throw new Error("Upload a PDF or design first.");
      }
      const first = pages[0];
      const orientation = first.width >= first.height ? "landscape" : "portrait";
      const doc = new jsPDF({ orientation, unit: "px", format: [first.width, first.height] });

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
      doc.save("id_card_manual_edit.pdf");
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
        throw new Error("Upload a PDF or design first.");
      }
      const zip = new JSZip();
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const canvas = await renderPageCanvas(page);
        const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
        const pageName = sanitizeFileName(page.label, `page_${index + 1}`);
        zip.file(`${pageName}.jpg`, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "id_card_pages.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Image export completed.");
    } catch (zipError) {
      setError(String(zipError?.message || "Unable to export images."));
    } finally {
      setExporting(false);
    }
  }

  function saveLayoutJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      uploadName,
      pages: pages.map((page, index) => ({
        id: page.id,
        order: index + 1,
        label: page.label,
        width: page.width,
        height: page.height,
        elements: page.elements,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "id_card_layout.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Layout JSON saved.");
  }

  const overlays = (selectedPage?.elements || []).map((item) => ({
    ...item,
    leftPct: (item.x / selectedPage.width) * 100,
    topPct: (item.y / selectedPage.height) * 100,
    widthPct: (item.width / selectedPage.width) * 100,
    heightPct: (item.height / selectedPage.height) * 100,
  }));

  return (
    <section className="imposition-panel idcard-panel-root">
      <div className="imposition-panel-heading">
        <h3>Card UPS Workspace</h3>
        <span>ID Card PDF Manual Editor</span>
      </div>

      <div className="idcard-studio-shell">
        <div className="idcard-studio-center">
          <div className="idcard-upload-row">
            <label className="imposition-upload-field">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleDesignUpload} />
              <span>{uploadName ? `Loaded: ${uploadName}` : "Upload ID Card PDF / Image"}</span>
            </label>
          </div>

          {selectedPage ? (
            <div
              ref={canvasRef}
              className="idcard-manual-canvas"
              style={{
                backgroundImage: `url(${selectedPage.backgroundDataUrl})`,
                aspectRatio: `${selectedPage.width}/${selectedPage.height}`,
              }}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={stopElementDrag}
              onMouseLeave={stopElementDrag}
              role="button"
              tabIndex={0}
              aria-label="ID card editor canvas"
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
                  onMouseDown={(event) => beginElementDrag(event, item.id)}
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
            <div className="idcard-empty-state">Upload PDF to preview 1-2 pages and start editing.</div>
          )}
        </div>

        <aside className="idcard-studio-right">
          <section className="idcard-side-card">
            <div className="idcard-side-head">
              <strong>Tools</strong>
              <span>Right side related features</span>
            </div>
            <div className="idcard-tool-row">
              <button type="button" className={`btn btn-secondary ${activeTool === "select" ? "is-active" : ""}`} onClick={() => setActiveTool("select")}>Select</button>
              <button type="button" className={`btn btn-secondary ${activeTool === "text" ? "is-active" : ""}`} onClick={() => setActiveTool("text")}>Text Mode</button>
              <button type="button" className={`btn btn-secondary ${activeTool === "image" ? "is-active" : ""}`} onClick={() => setActiveTool("image")}>Image Mode</button>
            </div>
            <label className="imposition-field">
              <span>Image Source (for Image Mode)</span>
              <input type="file" accept=".png,.jpg,.jpeg" onChange={handlePendingImage} />
            </label>
            <p className="imposition-muted-copy">PDF page centerல click பண்ணி text/image add பண்ணலாம்.</p>
          </section>

          <section className="idcard-side-card">
            <div className="idcard-side-head">
              <strong>Pages</strong>
              <span>Duplicate + drag/drop arrange</span>
            </div>
            <div className="idcard-page-list">
              {pages.map((page) => (
                <article
                  key={page.id}
                  className={`idcard-page-item ${selectedPageId === page.id ? "active" : ""}`}
                  draggable
                  onDragStart={() => setDragPageId(page.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    reorderPages(dragPageId, page.id);
                    setDragPageId("");
                  }}
                >
                  <button type="button" className="idcard-page-select" onClick={() => { setSelectedPageId(page.id); setSelectedElementId(""); }}>
                    {page.label}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => duplicatePage(page.id)}>Duplicate</button>
                </article>
              ))}
            </div>
          </section>

          <section className="idcard-side-card">
            <div className="idcard-side-head">
              <strong>Element Editor</strong>
              <span>Image replacement + text edit</span>
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
              <p className="imposition-muted-copy">ஒரு layer select பண்ணினா editor details இங்க வரும்.</p>
            )}
          </section>

          <section className="idcard-side-card">
            <div className="idcard-side-head">
              <strong>Export</strong>
              <span>PDF save + image export</span>
            </div>
            <div className="idcard-tool-row">
              <button type="button" className="btn btn-primary" onClick={savePdf} disabled={exporting}>Save PDF</button>
              <button type="button" className="btn btn-secondary" onClick={exportImages} disabled={exporting}>Export Images</button>
              <button type="button" className="btn btn-secondary" onClick={saveLayoutJson}>Save Layout</button>
            </div>
          </section>
        </aside>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
    </section>
  );
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
