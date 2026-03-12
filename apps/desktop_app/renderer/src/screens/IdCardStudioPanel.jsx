import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const REQUIRED_COLUMNS = [
  "image",
  "user_name",
  "designation",
  "date_of_birth",
  "temporary_address",
  "permanent_address",
  "contact_number",
];

const DEFAULT_FIELD = {
  id: "",
  label: "",
  type: "text",
  column: "",
  x: 40,
  y: 40,
  width: 200,
  height: 30,
  fontSize: 16,
};

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = url;
  });
}

function sanitizeFileName(value, fallback) {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9-_]+/g, "_");
  return cleaned || fallback;
}

function toCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function resolveRowImageName(row) {
  const raw = toCell(row.image);
  if (!raw) {
    return "";
  }
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

async function renderPdfPageToDataUrl(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png", 1);
}

export default function IdCardStudioPanel() {
  const [templateFileName, setTemplateFileName] = useState("");
  const [templateBackground, setTemplateBackground] = useState("");
  const [templateDimensions, setTemplateDimensions] = useState({ width: 1200, height: 675 });
  const [fields, setFields] = useState([]);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [pendingType, setPendingType] = useState("text");
  const [pendingColumn, setPendingColumn] = useState("user_name");
  const [pendingLabel, setPendingLabel] = useState("User Name");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [availableColumns, setAvailableColumns] = useState(REQUIRED_COLUMNS);
  const [imageFiles, setImageFiles] = useState(new Map());
  const [exportFormat, setExportFormat] = useState("pdf");
  const [exporting, setExporting] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewRef = useRef(null);

  const selectedField = useMemo(
    () => fields.find((item) => item.id === selectedFieldId) || null,
    [fields, selectedFieldId]
  );

  const previewRow = rows[previewIndex] || null;

  async function handleTemplateUpload(event) {
    try {
      setError("");
      setMessage("");
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const fileName = String(file.name || "template");
      const isPdf = fileName.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const dataUrl = isPdf ? await renderPdfPageToDataUrl(file) : await readAsDataUrl(file);
      const img = await loadImage(dataUrl);
      setTemplateBackground(dataUrl);
      setTemplateFileName(fileName);
      setTemplateDimensions({ width: img.width, height: img.height });
      setMessage("Template loaded. Click on the preview to place fields.");
    } catch (uploadError) {
      setError(String(uploadError?.message || "Template upload failed."));
    }
  }

  function addFieldFromClick(event) {
    if (!templateBackground || !previewRef.current) {
      return;
    }
    const rect = previewRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const relX = (event.clientX - rect.left) / rect.width;
    const relY = (event.clientY - rect.top) / rect.height;
    const x = Math.max(0, Math.round(relX * templateDimensions.width));
    const y = Math.max(0, Math.round(relY * templateDimensions.height));
    const next = {
      ...DEFAULT_FIELD,
      id: crypto.randomUUID(),
      label: pendingLabel || pendingColumn,
      type: pendingType,
      column: pendingColumn,
      x,
      y,
      width: pendingType === "image" ? 180 : 240,
      height: pendingType === "image" ? 220 : 32,
    };
    setFields((current) => [...current, next]);
    setSelectedFieldId(next.id);
    setMessage(`Placed ${next.label} field.`);
  }

  function updateField(fieldId, patch) {
    setFields((current) => current.map((item) => (item.id === fieldId ? { ...item, ...patch } : item)));
  }

  function removeField(fieldId) {
    setFields((current) => current.filter((item) => item.id !== fieldId));
    setSelectedFieldId("");
  }

  function downloadTemplateWorkbook() {
    const dataRows = [
      {
        image: "member1.jpg",
        user_name: "Ravi Kumar",
        designation: "Team Lead",
        date_of_birth: "1992-09-10",
        temporary_address: "12, Anna Nagar, Chennai",
        permanent_address: "5, Gandhi Street, Madurai",
        contact_number: "9876543210",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(dataRows, { header: REQUIRED_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "members");
    XLSX.writeFile(wb, "id_card_members_template.xlsx");
    setMessage("Excel template downloaded.");
    setError("");
  }

  async function handleExcelImport(event) {
    try {
      setError("");
      setMessage("");
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
      const headers = headerRow.map((value) => String(value || "").trim()).filter(Boolean);
      setAvailableColumns(headers.length ? headers : REQUIRED_COLUMNS);
      setRows(imported);
      setPreviewIndex(0);
      const missing = REQUIRED_COLUMNS.filter((name) => !headers.includes(name));
      if (missing.length) {
        setMessage(`Excel imported with ${imported.length} rows. Missing recommended columns: ${missing.join(", ")}`);
      } else {
        setMessage(`Excel imported with ${imported.length} rows.`);
      }
    } catch (importError) {
      setError(String(importError?.message || "Failed to import Excel."));
    }
  }

  function handleImageFolderSelect(event) {
    const selected = event.target.files || [];
    const next = new Map();
    Array.from(selected).forEach((file) => {
      next.set(file.name, file);
      if (file.webkitRelativePath) {
        next.set(file.webkitRelativePath, file);
      }
    });
    setImageFiles(next);
    setMessage(`Image folder indexed with ${next.size} entries.`);
    setError("");
  }

  async function renderCardCanvas(row) {
    const canvas = document.createElement("canvas");
    canvas.width = templateDimensions.width;
    canvas.height = templateDimensions.height;
    const ctx = canvas.getContext("2d");

    const background = await loadImage(templateBackground);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    for (const field of fields) {
      const rawValue = toCell(row[field.column]);
      if (field.type === "image") {
        const imageName = resolveRowImageName({ image: rawValue || row.image });
        const imageFile = imageFiles.get(imageName) || imageFiles.get(rawValue);
        if (!imageFile) {
          continue;
        }
        const dataUrl = await readAsDataUrl(imageFile);
        const img = await loadImage(dataUrl);
        ctx.drawImage(img, field.x, field.y, field.width, field.height);
      } else {
        ctx.font = `${field.fontSize || 16}px "Arial"`;
        ctx.fillStyle = "#101828";
        ctx.textBaseline = "top";
        const maxWidth = field.width || templateDimensions.width - field.x;
        wrapText(ctx, rawValue, field.x, field.y, maxWidth, (field.fontSize || 16) + 4, field.height || 500);
      }
    }

    return canvas;
  }

  async function exportCards() {
    try {
      setExporting(true);
      setError("");
      setMessage("");
      if (!templateBackground) {
        throw new Error("Upload ID card template first.");
      }
      if (!fields.length) {
        throw new Error("Place at least one dynamic field.");
      }
      if (!rows.length) {
        throw new Error("Import Excel data before export.");
      }

      if (exportFormat === "pdf") {
        const doc = new jsPDF({
          orientation: templateDimensions.width >= templateDimensions.height ? "landscape" : "portrait",
          unit: "px",
          format: [templateDimensions.width, templateDimensions.height],
        });

        for (let index = 0; index < rows.length; index += 1) {
          const canvas = await renderCardCanvas(rows[index]);
          const imageData = canvas.toDataURL("image/jpeg", 0.95);
          if (index > 0) {
            doc.addPage([templateDimensions.width, templateDimensions.height], templateDimensions.width >= templateDimensions.height ? "landscape" : "portrait");
          }
          doc.addImage(imageData, "JPEG", 0, 0, templateDimensions.width, templateDimensions.height);
        }
        doc.save("id_cards.pdf");
        setMessage(`Generated ${rows.length} ID cards as PDF.`);
      } else {
        const zip = new JSZip();
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const canvas = await renderCardCanvas(row);
          const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
          const rowName = sanitizeFileName(row.user_name || row.member_name, `member_${index + 1}`);
          zip.file(`${rowName}.jpg`, base64, { base64: true });
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "id_cards_jpg.zip";
        link.click();
        URL.revokeObjectURL(url);
        setMessage(`Generated ${rows.length} ID cards as JPG ZIP.`);
      }
    } catch (exportError) {
      setError(String(exportError?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  }

  const placementOverlays = fields.map((field) => ({
    ...field,
    leftPct: (field.x / templateDimensions.width) * 100,
    topPct: (field.y / templateDimensions.height) * 100,
    widthPct: (field.width / templateDimensions.width) * 100,
    heightPct: (field.height / templateDimensions.height) * 100,
  }));

  return (
    <section className="imposition-panel">
      <div className="imposition-panel-heading">
        <h3>ID Card Studio</h3>
        <span>Template mapping + Excel import + PDF/JPG export</span>
      </div>

      <div className="idcard-step-grid">
        <div className="idcard-step-card">
          <strong>Step 1</strong>
          <span>Upload ID card design (PDF/JPG/PNG)</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleTemplateUpload} />
          <small>{templateFileName || "No template selected"}</small>
        </div>

        <div className="idcard-step-card">
          <strong>Step 2</strong>
          <span>Select dynamic field, then click template area</span>
          <label className="imposition-field">
            <span>Field Type</span>
            <select value={pendingType} onChange={(event) => setPendingType(event.target.value)}>
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </label>
          <label className="imposition-field">
            <span>Excel Column</span>
            <select value={pendingColumn} onChange={(event) => setPendingColumn(event.target.value)}>
              {availableColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <label className="imposition-field">
            <span>Field Label</span>
            <input value={pendingLabel} onChange={(event) => setPendingLabel(event.target.value)} />
          </label>
        </div>

        <div className="idcard-step-card">
          <strong>Step 3</strong>
          <span>Download template Excel format</span>
          <button type="button" className="btn btn-secondary" onClick={downloadTemplateWorkbook}>
            Download Excel Format
          </button>
        </div>

        <div className="idcard-step-card">
          <strong>Step 4</strong>
          <span>Import member Excel + choose image folder</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} />
          <label className="idcard-folder-picker">
            <span>Select Image Folder</span>
            <input type="file" webkitdirectory="" multiple onChange={handleImageFolderSelect} />
          </label>
          <small>{rows.length} members loaded</small>
        </div>
      </div>

      {templateBackground ? (
        <div className="idcard-editor-grid">
          <div className="idcard-canvas-wrap">
            <div
              ref={previewRef}
              className="idcard-canvas"
              style={{ backgroundImage: `url(${templateBackground})` }}
              onClick={addFieldFromClick}
              role="button"
              tabIndex={0}
              aria-label="Template field placement canvas"
            >
              {placementOverlays.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  className={`idcard-overlay ${selectedFieldId === field.id ? "active" : ""}`}
                  style={{
                    left: `${field.leftPct}%`,
                    top: `${field.topPct}%`,
                    width: `${field.widthPct}%`,
                    height: `${field.heightPct}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedFieldId(field.id);
                  }}
                  title={`${field.label} (${field.column})`}
                >
                  {field.label}
                </button>
              ))}
            </div>
            <p className="imposition-muted-copy">Click the template to place selected field. Select overlay to edit it.</p>
          </div>

          <div className="idcard-editor-side">
            <div className="imposition-panel-heading">
              <h3>Field Editor</h3>
              <span>{fields.length} mapped fields</span>
            </div>
            {selectedField ? (
              <div className="imposition-form-grid imposition-form-grid-tight">
                <label className="imposition-field">
                  <span>Label</span>
                  <input value={selectedField.label} onChange={(event) => updateField(selectedField.id, { label: event.target.value })} />
                </label>
                <label className="imposition-field">
                  <span>Column</span>
                  <select value={selectedField.column} onChange={(event) => updateField(selectedField.id, { column: event.target.value })}>
                    {availableColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="imposition-field">
                  <span>X</span>
                  <input type="number" value={selectedField.x} onChange={(event) => updateField(selectedField.id, { x: Number(event.target.value) })} />
                </label>
                <label className="imposition-field">
                  <span>Y</span>
                  <input type="number" value={selectedField.y} onChange={(event) => updateField(selectedField.id, { y: Number(event.target.value) })} />
                </label>
                <label className="imposition-field">
                  <span>Width</span>
                  <input type="number" value={selectedField.width} onChange={(event) => updateField(selectedField.id, { width: Number(event.target.value) })} />
                </label>
                <label className="imposition-field">
                  <span>Height</span>
                  <input type="number" value={selectedField.height} onChange={(event) => updateField(selectedField.id, { height: Number(event.target.value) })} />
                </label>
                {selectedField.type === "text" ? (
                  <label className="imposition-field">
                    <span>Font Size</span>
                    <input type="number" value={selectedField.fontSize} onChange={(event) => updateField(selectedField.id, { fontSize: Number(event.target.value) })} />
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="imposition-muted-copy">Select a mapped field to edit coordinates and size.</p>
            )}
            <div className="button-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!selectedField}
                onClick={() => selectedField && removeField(selectedField.id)}
              >
                Remove Field
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="idcard-export-row">
        <label className="imposition-field">
          <span>Output</span>
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
            <option value="pdf">PDF</option>
            <option value="jpg">JPG (ZIP)</option>
          </select>
        </label>
        {rows.length > 0 ? (
          <label className="imposition-field">
            <span>Preview Row</span>
            <select value={String(previewIndex)} onChange={(event) => setPreviewIndex(Number(event.target.value))}>
              {rows.map((row, index) => (
                <option key={`row-${index}`} value={String(index)}>
                  {index + 1}. {toCell(row.user_name) || `Member ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={exportCards} disabled={exporting}>
          {exporting ? "Generating..." : `Generate ${exportFormat.toUpperCase()}`}
        </button>
      </div>

      {previewRow ? (
        <div className="idcard-preview-note">
          Preview data: {toCell(previewRow.user_name)} | {toCell(previewRow.designation)} | {toCell(previewRow.contact_number)}
        </div>
      ) : null}

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
