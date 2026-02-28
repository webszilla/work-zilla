import { useEffect, useMemo, useState } from "react";
import {
  buildBookImposition,
  buildExportPlan,
  buildHotFolderRecipe,
  buildQrBarcodePreview,
  buildSerialPreview,
  getSheetPresets,
  optimizeSheetLayout,
  resolveSheet,
} from "../lib/impositionEngine.js";

const MENU_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "DB" },
  { id: "imposition", label: "Imposition", icon: "IM" },
  { id: "book", label: "Book UPS", icon: "BK" },
  { id: "business-card", label: "Business Card UPS", icon: "BC" },
  { id: "sticker", label: "Sticker UPS", icon: "ST" },
  { id: "label", label: "Label UPS", icon: "LB" },
  { id: "sheet", label: "Sheet Setup", icon: "SH" },
  { id: "templates", label: "Templates", icon: "TP" },
  { id: "data-import", label: "Data Import", icon: "DI" },
  { id: "qr", label: "QR / Barcode", icon: "QR" },
  { id: "serial", label: "Serial Generator", icon: "SR" },
  { id: "hot-folder", label: "Hot Folder", icon: "HF" },
  { id: "history", label: "Print History", icon: "PH" },
  { id: "settings", label: "Settings", icon: "SE" },
];

const SHEET_OPTIONS = Object.keys(getSheetPresets());
const ZOOM_OPTIONS = [25, 50, 100, 140];
const DEFAULT_EXPORT = {
  format: "pdf",
  dpi: 300,
  cropMarks: true,
  bleedMarks: true,
  registrationMarks: false,
};

const DEFAULT_SHEET_SETUP = {
  sheetKey: "A3",
  customWidthMm: 330,
  customHeightMm: 483,
  marginMm: 6,
  bleedMm: 2,
  gapMm: 3,
};

const DEFAULT_BUSINESS_CARD = {
  designName: "Premium Business Card",
  widthMm: 90,
  heightMm: 54,
  quantity: 5000,
  allowRotation: true,
};

const DEFAULT_STICKER = {
  designName: "Square Sticker",
  widthMm: 50,
  heightMm: 50,
  quantity: 2000,
  allowRotation: true,
};

const DEFAULT_LABEL = {
  designName: "Shipping Label",
  widthMm: 100,
  heightMm: 35,
  quantity: 3200,
  allowRotation: true,
};

const DEFAULT_BOOK = {
  title: "Product Catalogue",
  pageWidthMm: 148,
  pageHeightMm: 210,
  totalPages: 16,
  bindingType: "center-staple",
  signatureSize: 16,
};

const TEMPLATE_LIBRARY = [
  { name: "A4 Business Card Gang Run", type: "Business Card UPS", sheet: "A4", output: "10 up" },
  { name: "A3 Sticker Sheet", type: "Sticker UPS", sheet: "A3", output: "49 up" },
  { name: "SRA3 Booklet 16pp", type: "Book UPS", sheet: "SRA3", output: "4 spreads" },
  { name: "12x18 Product Label Grid", type: "Label UPS", sheet: "12x18", output: "18 up" },
];

const IMPORT_FIELDS = [
  { field: "job_name", mappedTo: "Job Name" },
  { field: "sku", mappedTo: "SKU" },
  { field: "design_path", mappedTo: "Artwork Path" },
  { field: "quantity", mappedTo: "Quantity" },
  { field: "finish", mappedTo: "Finish" },
];

const HISTORY_ROWS = [
  { job: "Business Cards - Sai Creatives", type: "Business Card UPS", sheets: 500, output: "PDF", status: "Completed" },
  { job: "Festival Labels", type: "Label UPS", sheets: 146, output: "TIFF", status: "Completed" },
  { job: "Sticker Promo Pack", type: "Sticker UPS", sheets: 82, output: "PNG", status: "Queued" },
  { job: "16 Page Product Booklet", type: "Book UPS", sheets: 12, output: "PDF", status: "Ready" },
];

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, caption }) {
  return (
    <article className="imposition-metric-card">
      <div className="imposition-metric-label">{label}</div>
      <div className="imposition-metric-value">{value}</div>
      <div className="imposition-metric-caption">{caption}</div>
    </article>
  );
}

function SidebarButton({ item, activeId, onSelect }) {
  return (
    <button
      type="button"
      title={item.label}
      className={`imposition-sidebar-button ${activeId === item.id ? "active" : ""}`}
      onClick={() => onSelect(item.id)}
    >
      <span className="imposition-sidebar-icon">{item.icon}</span>
      <span className="imposition-sidebar-tooltip">{item.label}</span>
    </button>
  );
}

function CanvasPreview({ layout, bookPlan, zoom }) {
  if (!layout?.sheet) {
    return (
      <div className="imposition-canvas-empty">
        Load a sheet and product size to preview the UPS layout.
      </div>
    );
  }

  const sheetWidth = layout.sheet.widthMm;
  const sheetHeight = layout.sheet.heightMm;
  const scale = zoom / 100;
  const previewWidth = Math.max(420, sheetWidth * 1.55 * scale);
  const previewHeight = Math.max(320, sheetHeight * 1.2 * scale);
  const isBook = Boolean(bookPlan);

  return (
    <div className="imposition-canvas-stage">
      <svg
        className="imposition-canvas"
        width={previewWidth}
        height={previewHeight}
        viewBox={`0 0 ${sheetWidth + 24} ${sheetHeight + 24}`}
        role="img"
        aria-label="Sheet layout preview"
      >
        <rect x="12" y="12" width={sheetWidth} height={sheetHeight} rx="8" className="sheet-outline" />
        <rect
          x={12 + layout.settings.marginMm}
          y={12 + layout.settings.marginMm}
          width={Math.max(0, sheetWidth - layout.settings.marginMm * 2)}
          height={Math.max(0, sheetHeight - layout.settings.marginMm * 2)}
          className="sheet-safe-area"
        />
        {layout.placements.map((placement) => (
          <g key={`${placement.index}-${placement.x}-${placement.y}`}>
            <rect
              x={12 + placement.x}
              y={12 + placement.y}
              width={placement.widthMm + placement.bleedMm * 2}
              height={placement.heightMm + placement.bleedMm * 2}
              className="sheet-bleed-box"
            />
            <rect
              x={12 + placement.x + placement.bleedMm}
              y={12 + placement.y + placement.bleedMm}
              width={placement.widthMm}
              height={placement.heightMm}
              className="sheet-item-box"
            />
            <text
              x={12 + placement.x + placement.bleedMm + placement.widthMm / 2}
              y={12 + placement.y + placement.bleedMm + placement.heightMm / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="sheet-item-label"
            >
              {isBook && bookPlan?.sections?.[0]?.spreads?.[0]
                ? `${bookPlan.sections[0].spreads[0].front.left}-${bookPlan.sections[0].spreads[0].front.right}`
                : placement.index}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ResultSummary({ title, layout, suffix }) {
  return (
    <section className="imposition-panel">
      <div className="imposition-panel-heading">
        <h3>{title}</h3>
        <span>{suffix}</span>
      </div>
      <div className="imposition-stats-grid">
        <MetricCard label="UPS" value={layout.summary.itemCount} caption={`${layout.summary.columns} cols x ${layout.summary.rows} rows`} />
        <MetricCard label="Sheets" value={layout.summary.sheetCount} caption="For current quantity" />
        <MetricCard label="Efficiency" value={`${layout.summary.efficiency}%`} caption="Usable sheet coverage" />
        <MetricCard label="Orientation" value={layout.summary.rotated ? "Rotated" : "Standard"} caption="Best auto-fit result" />
      </div>
    </section>
  );
}

function TextInput({ label, value, onChange, type = "text", min, step, placeholder }) {
  return (
    <label className="imposition-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        step={step}
        placeholder={placeholder}
        onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <label className="imposition-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ImpositionScreen({ onBack }) {
  const [activeMenu, setActiveMenu] = useState("business-card");
  const [zoom, setZoom] = useState(100);
  const [sheetSetup, setSheetSetup] = useState(DEFAULT_SHEET_SETUP);
  const [businessCard, setBusinessCard] = useState(DEFAULT_BUSINESS_CARD);
  const [sticker, setSticker] = useState(DEFAULT_STICKER);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [book, setBook] = useState(DEFAULT_BOOK);
  const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT);
  const [hotFolderPath, setHotFolderPath] = useState("/hotfolder/cards");
  const [licenseCode, setLicenseCode] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const [licenseMessage, setLicenseMessage] = useState("");
  const [policy, setPolicy] = useState(null);
  const [exportQueue, setExportQueue] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function loadPolicy() {
      try {
        const response = await window.storageApi.getImpositionPolicy?.();
        if (mounted) {
          setPolicy(response?.policy || null);
        }
      } catch (_error) {
        if (mounted) {
          setPolicy(null);
        }
      }
    }
    loadPolicy();
    return () => {
      mounted = false;
    };
  }, []);

  const activeSheet = useMemo(
    () => resolveSheet(sheetSetup.sheetKey, sheetSetup.customWidthMm, sheetSetup.customHeightMm),
    [sheetSetup]
  );

  const businessCardLayout = useMemo(
    () =>
      optimizeSheetLayout({
        sheetKey: sheetSetup.sheetKey,
        customSheetWidthMm: sheetSetup.customWidthMm,
        customSheetHeightMm: sheetSetup.customHeightMm,
        itemWidthMm: businessCard.widthMm,
        itemHeightMm: businessCard.heightMm,
        marginMm: sheetSetup.marginMm,
        bleedMm: sheetSetup.bleedMm,
        gapMm: sheetSetup.gapMm,
        allowRotation: businessCard.allowRotation,
        quantity: businessCard.quantity,
      }),
    [businessCard, sheetSetup]
  );

  const stickerLayout = useMemo(
    () =>
      optimizeSheetLayout({
        sheetKey: sheetSetup.sheetKey,
        customSheetWidthMm: sheetSetup.customWidthMm,
        customSheetHeightMm: sheetSetup.customHeightMm,
        itemWidthMm: sticker.widthMm,
        itemHeightMm: sticker.heightMm,
        marginMm: sheetSetup.marginMm,
        bleedMm: sheetSetup.bleedMm,
        gapMm: sheetSetup.gapMm,
        allowRotation: sticker.allowRotation,
        quantity: sticker.quantity,
      }),
    [sheetSetup, sticker]
  );

  const labelLayout = useMemo(
    () =>
      optimizeSheetLayout({
        sheetKey: sheetSetup.sheetKey,
        customSheetWidthMm: sheetSetup.customWidthMm,
        customSheetHeightMm: sheetSetup.customHeightMm,
        itemWidthMm: label.widthMm,
        itemHeightMm: label.heightMm,
        marginMm: sheetSetup.marginMm,
        bleedMm: sheetSetup.bleedMm,
        gapMm: sheetSetup.gapMm,
        allowRotation: label.allowRotation,
        quantity: label.quantity,
      }),
    [label, sheetSetup]
  );

  const bookPlan = useMemo(
    () =>
      buildBookImposition({
        totalPages: book.totalPages,
        bindingType: book.bindingType,
        signatureSize: book.signatureSize,
        pageWidthMm: book.pageWidthMm,
        pageHeightMm: book.pageHeightMm,
        sheetKey: sheetSetup.sheetKey,
        customSheetWidthMm: sheetSetup.customWidthMm,
        customSheetHeightMm: sheetSetup.customHeightMm,
      }),
    [book, sheetSetup]
  );

  const currentLayout = useMemo(() => {
    if (activeMenu === "book") {
      return bookPlan.layout;
    }
    if (activeMenu === "sticker") {
      return stickerLayout;
    }
    if (activeMenu === "label") {
      return labelLayout;
    }
    return businessCardLayout;
  }, [activeMenu, bookPlan, businessCardLayout, labelLayout, stickerLayout]);

  const currentJobName = useMemo(() => {
    if (activeMenu === "book") {
      return book.title;
    }
    if (activeMenu === "sticker") {
      return sticker.designName;
    }
    if (activeMenu === "label") {
      return label.designName;
    }
    return businessCard.designName;
  }, [activeMenu, book.title, businessCard.designName, label.designName, sticker.designName]);

  const currentModuleLabel = useMemo(
    () => MENU_ITEMS.find((item) => item.id === activeMenu)?.label || "Imposition",
    [activeMenu]
  );

  const licenseProfile = {
    userName: policy?.device?.user_name || "Press Operator",
    organization: policy?.organization_name || "Sai Creatives",
    plan: policy?.plan?.name || "Business",
    devicesUsed: policy?.device?.used_count || 2,
    devicesAllowed: policy?.plan?.device_limit || 5,
    status: policy ? "ACTIVE" : "NOT ACTIVATED",
  };

  const optimizationHighlights = [
    `Sheet: ${activeSheet.label} (${activeSheet.widthMm} x ${activeSheet.heightMm} mm)`,
    `Margins ${sheetSetup.marginMm} mm / Bleed ${sheetSetup.bleedMm} mm / Gap ${sheetSetup.gapMm} mm`,
    `Auto layout returns ${currentLayout.summary.itemCount} items per sheet with ${currentLayout.summary.efficiency}% efficiency`,
  ];

  const hotFolderRecipe = useMemo(
    () =>
      buildHotFolderRecipe({
        folderPath: hotFolderPath,
        moduleName: currentModuleLabel,
        format: exportOptions.format.toUpperCase(),
        dpi: exportOptions.dpi,
        layout: currentLayout,
      }),
    [currentLayout, currentModuleLabel, exportOptions.dpi, exportOptions.format, hotFolderPath]
  );

  function updateSheet(field, value) {
    setSheetSetup((current) => ({ ...current, [field]: value }));
  }

  function updateBusinessCard(field, value) {
    setBusinessCard((current) => ({ ...current, [field]: value }));
  }

  function updateSticker(field, value) {
    setSticker((current) => ({ ...current, [field]: value }));
  }

  function updateLabel(field, value) {
    setLabel((current) => ({ ...current, [field]: value }));
  }

  function updateBook(field, value) {
    setBook((current) => ({ ...current, [field]: value }));
  }

  async function activateLicense() {
    setLicenseBusy(true);
    setLicenseError("");
    setLicenseMessage("");
    try {
      const code = String(licenseCode || "").trim();
      if (!code) {
        throw new Error("License code is required.");
      }
      await window.storageApi.validateImpositionLicense?.({ license_code: code });
      const response = await window.storageApi.registerImpositionDevice?.({ license_code: code });
      setPolicy(response?.policy || null);
      setLicenseMessage("License activated for this workstation.");
    } catch (error) {
      setLicenseError(String(error?.message || error?.code || "Activation failed."));
    } finally {
      setLicenseBusy(false);
    }
  }

  function queueExport() {
    const plan = buildExportPlan({
      jobName: currentJobName,
      moduleName: currentModuleLabel,
      format: exportOptions.format,
      dpi: exportOptions.dpi,
      includeCropMarks: exportOptions.cropMarks,
      includeBleedMarks: exportOptions.bleedMarks,
      includeRegistrationMarks: exportOptions.registrationMarks,
      layout: currentLayout,
    });
    setExportQueue((current) => [plan, ...current].slice(0, 8));
    downloadJson(`${plan.outputName}.plan.json`, plan);
  }

  function renderDashboard() {
    return (
      <div className="imposition-dashboard-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Production Overview</h3>
            <span>Digital Printing Press UPS</span>
          </div>
          <div className="imposition-stats-grid">
            <MetricCard label="Booklet Jobs" value="18" caption="Center staple and perfect binding" />
            <MetricCard label="Card Jobs" value="43" caption="Auto UPS batches this week" />
            <MetricCard label="Queued Exports" value={exportQueue.length} caption="PDF / PNG / TIFF output" />
            <MetricCard label="Hot Folder" value="Live" caption={hotFolderRecipe.folderPath} />
          </div>
        </section>
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Optimization Engine</h3>
            <span>Current press profile</span>
          </div>
          <ul className="imposition-bullet-list">
            {optimizationHighlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <ResultSummary title="Business Card UPS" layout={businessCardLayout} suffix="90 x 54 mm auto fit" />
        <ResultSummary title="Sticker UPS" layout={stickerLayout} suffix="Grid optimization" />
      </div>
    );
  }

  function renderSheetSetup() {
    return (
      <div className="imposition-settings-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Sheet Setup</h3>
            <span>Press stock and margins</span>
          </div>
          <div className="imposition-form-grid">
            <SelectInput
              label="Sheet Size"
              value={sheetSetup.sheetKey}
              onChange={(value) => updateSheet("sheetKey", value)}
              options={SHEET_OPTIONS.map((item) => ({ value: item, label: item }))}
            />
            <TextInput label="Sheet Width (mm)" type="number" value={sheetSetup.customWidthMm} onChange={(value) => updateSheet("customWidthMm", value)} min={50} />
            <TextInput label="Sheet Height (mm)" type="number" value={sheetSetup.customHeightMm} onChange={(value) => updateSheet("customHeightMm", value)} min={50} />
            <TextInput label="Margins (mm)" type="number" value={sheetSetup.marginMm} onChange={(value) => updateSheet("marginMm", value)} min={0} step={0.5} />
            <TextInput label="Bleed (mm)" type="number" value={sheetSetup.bleedMm} onChange={(value) => updateSheet("bleedMm", value)} min={0} step={0.5} />
            <TextInput label="Gap (mm)" type="number" value={sheetSetup.gapMm} onChange={(value) => updateSheet("gapMm", value)} min={0} step={0.5} />
          </div>
        </section>
        <ResultSummary title="Auto Sheet Optimization" layout={currentLayout} suffix={`${activeSheet.widthMm} x ${activeSheet.heightMm} mm`} />
      </div>
    );
  }

  function renderBusinessCard() {
    return (
      <div className="imposition-settings-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Business Card UPS</h3>
            <span>Auto fit for gang run cards</span>
          </div>
          <div className="imposition-form-grid">
            <TextInput label="Design Name" value={businessCard.designName} onChange={(value) => updateBusinessCard("designName", value)} />
            <TextInput label="Card Width (mm)" type="number" value={businessCard.widthMm} onChange={(value) => updateBusinessCard("widthMm", value)} min={10} step={0.5} />
            <TextInput label="Card Height (mm)" type="number" value={businessCard.heightMm} onChange={(value) => updateBusinessCard("heightMm", value)} min={10} step={0.5} />
            <TextInput label="Quantity" type="number" value={businessCard.quantity} onChange={(value) => updateBusinessCard("quantity", value)} min={1} step={100} />
            <label className="imposition-check">
              <input
                type="checkbox"
                checked={businessCard.allowRotation}
                onChange={(event) => updateBusinessCard("allowRotation", event.target.checked)}
              />
              <span>Allow rotation for better UPS</span>
            </label>
          </div>
        </section>
        <ResultSummary title="Business Card Result" layout={businessCardLayout} suffix="Example: 90 x 54 mm card" />
      </div>
    );
  }

  function renderSticker() {
    return (
      <div className="imposition-settings-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Sticker UPS</h3>
            <span>Square and die-cut grid generation</span>
          </div>
          <div className="imposition-form-grid">
            <TextInput label="Design Name" value={sticker.designName} onChange={(value) => updateSticker("designName", value)} />
            <TextInput label="Sticker Width (mm)" type="number" value={sticker.widthMm} onChange={(value) => updateSticker("widthMm", value)} min={10} step={0.5} />
            <TextInput label="Sticker Height (mm)" type="number" value={sticker.heightMm} onChange={(value) => updateSticker("heightMm", value)} min={10} step={0.5} />
            <TextInput label="Quantity" type="number" value={sticker.quantity} onChange={(value) => updateSticker("quantity", value)} min={1} step={100} />
            <label className="imposition-check">
              <input
                type="checkbox"
                checked={sticker.allowRotation}
                onChange={(event) => updateSticker("allowRotation", event.target.checked)}
              />
              <span>Allow rotation</span>
            </label>
          </div>
        </section>
        <ResultSummary title="Sticker Grid" layout={stickerLayout} suffix="Auto generated grid layout" />
      </div>
    );
  }

  function renderLabel() {
    return (
      <div className="imposition-settings-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Label UPS</h3>
            <span>Roll label or sheet label layout</span>
          </div>
          <div className="imposition-form-grid">
            <TextInput label="Design Name" value={label.designName} onChange={(value) => updateLabel("designName", value)} />
            <TextInput label="Label Width (mm)" type="number" value={label.widthMm} onChange={(value) => updateLabel("widthMm", value)} min={10} step={0.5} />
            <TextInput label="Label Height (mm)" type="number" value={label.heightMm} onChange={(value) => updateLabel("heightMm", value)} min={10} step={0.5} />
            <TextInput label="Quantity" type="number" value={label.quantity} onChange={(value) => updateLabel("quantity", value)} min={1} step={100} />
            <label className="imposition-check">
              <input
                type="checkbox"
                checked={label.allowRotation}
                onChange={(event) => updateLabel("allowRotation", event.target.checked)}
              />
              <span>Allow rotation</span>
            </label>
          </div>
        </section>
        <ResultSummary title="Label Layout" layout={labelLayout} suffix="Roll label optimization" />
      </div>
    );
  }

  function renderBook() {
    return (
      <div className="imposition-settings-grid">
        <section className="imposition-panel">
          <div className="imposition-panel-heading">
            <h3>Book UPS</h3>
            <span>Most important booklet imposition module</span>
          </div>
          <div className="imposition-form-grid">
            <TextInput label="Book Title" value={book.title} onChange={(value) => updateBook("title", value)} />
            <TextInput label="Page Width (mm)" type="number" value={book.pageWidthMm} onChange={(value) => updateBook("pageWidthMm", value)} min={20} step={0.5} />
            <TextInput label="Page Height (mm)" type="number" value={book.pageHeightMm} onChange={(value) => updateBook("pageHeightMm", value)} min={20} step={0.5} />
            <TextInput label="Total Pages" type="number" value={book.totalPages} onChange={(value) => updateBook("totalPages", value)} min={4} step={4} />
            <SelectInput
              label="Binding Type"
              value={book.bindingType}
              onChange={(value) => updateBook("bindingType", value)}
              options={[
                { value: "center-staple", label: "Center Staple" },
                { value: "perfect-binding", label: "Perfect Binding" },
              ]}
            />
            <TextInput label="Signature Size" type="number" value={book.signatureSize} onChange={(value) => updateBook("signatureSize", value)} min={4} step={4} />
          </div>
          <div className="imposition-book-grid">
            {bookPlan.sections.map((section) => (
              <article key={`${section.label}-${section.startPage}`} className="imposition-book-card">
                <strong>{section.label}</strong>
                <span>
                  Pages {section.startPage} - {section.endPage}
                </span>
                {section.spreads.slice(0, 3).map((spread, index) => (
                  <div key={`${section.label}-${index}`} className="imposition-book-spread">
                    <span>Front {spread.front.left} / {spread.front.right}</span>
                    <span>Back {spread.back.left} / {spread.back.right}</span>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>
        <ResultSummary title="Booklet Sheet Result" layout={bookPlan.layout} suffix={`${bookPlan.paddedPages} imposed pages`} />
      </div>
    );
  }

  function renderTemplates() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Templates</h3>
          <span>Reusable press presets</span>
        </div>
        <div className="imposition-template-grid">
          {TEMPLATE_LIBRARY.map((template) => (
            <article key={template.name} className="imposition-template-card">
              <strong>{template.name}</strong>
              <span>{template.type}</span>
              <span>{template.sheet}</span>
              <span>{template.output}</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderDataImport() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Data Import</h3>
          <span>Excel and CSV mapping</span>
        </div>
        <div className="imposition-import-grid">
          {IMPORT_FIELDS.map((row) => (
            <div key={row.field} className="imposition-import-row">
              <span>{row.field}</span>
              <span>{row.mappedTo}</span>
            </div>
          ))}
        </div>
        <p className="imposition-muted-copy">
          Current structure supports QR generator and Excel import, but UPS generation is now the primary output path.
        </p>
      </section>
    );
  }

  function renderQr() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>QR / Barcode</h3>
          <span>Variable data marks for print jobs</span>
        </div>
        <div className="imposition-template-grid">
          {buildQrBarcodePreview().map((item) => (
            <article key={item.label} className="imposition-template-card">
              <strong>{item.label}</strong>
              <span>{item.usage}</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderSerialGenerator() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Serial Generator</h3>
          <span>Variable sheet and carton tracking</span>
        </div>
        <div className="imposition-serial-grid">
          {buildSerialPreview("PRESS").map((item) => (
            <span key={item} className="imposition-serial-pill">{item}</span>
          ))}
        </div>
      </section>
    );
  }

  function renderHotFolder() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Hot Folder Automation</h3>
          <span>Watch -&gt; impose -&gt; export</span>
        </div>
        <div className="imposition-form-grid">
          <TextInput label="Folder Path" value={hotFolderPath} onChange={setHotFolderPath} />
          <TextInput label="Output Pattern" value={hotFolderRecipe.outputPattern} onChange={() => {}} />
        </div>
        <div className="imposition-code-block">
          <pre>{JSON.stringify(hotFolderRecipe, null, 2)}</pre>
        </div>
      </section>
    );
  }

  function renderHistory() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Print History</h3>
          <span>Recent batch jobs</span>
        </div>
        <div className="imposition-history-table">
          <div className="imposition-history-head">
            <span>Job</span>
            <span>Module</span>
            <span>Sheets</span>
            <span>Output</span>
            <span>Status</span>
          </div>
          {HISTORY_ROWS.map((row) => (
            <div key={`${row.job}-${row.status}`} className="imposition-history-row">
              <span>{row.job}</span>
              <span>{row.type}</span>
              <span>{row.sheets}</span>
              <span>{row.output}</span>
              <span>{row.status}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className="imposition-panel">
        <div className="imposition-panel-heading">
          <h3>Settings</h3>
          <span>License, export, press defaults</span>
        </div>
        <div className="imposition-form-grid">
          <TextInput label="License Code" value={licenseCode} onChange={setLicenseCode} placeholder="IMP-XXXXX-XXXXX" />
          <SelectInput
            label="Default Export"
            value={exportOptions.format}
            onChange={(value) => setExportOptions((current) => ({ ...current, format: value }))}
            options={[
              { value: "pdf", label: "PDF (Print Ready)" },
              { value: "png", label: "PNG" },
              { value: "tiff", label: "TIFF" },
            ]}
          />
          <SelectInput
            label="DPI"
            value={String(exportOptions.dpi)}
            onChange={(value) => setExportOptions((current) => ({ ...current, dpi: Number(value) }))}
            options={[
              { value: "300", label: "300 DPI" },
              { value: "600", label: "600 DPI" },
            ]}
          />
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-primary" disabled={licenseBusy} onClick={activateLicense}>
            {licenseBusy ? "Activating..." : "Activate License"}
          </button>
        </div>
        {licenseMessage ? <div className="alert alert-info">{licenseMessage}</div> : null}
        {licenseError ? <div className="alert alert-danger">{licenseError}</div> : null}
      </section>
    );
  }

  function renderPrimaryPanel() {
    if (activeMenu === "dashboard" || activeMenu === "imposition") {
      return renderDashboard();
    }
    if (activeMenu === "sheet") {
      return renderSheetSetup();
    }
    if (activeMenu === "business-card") {
      return renderBusinessCard();
    }
    if (activeMenu === "sticker") {
      return renderSticker();
    }
    if (activeMenu === "label") {
      return renderLabel();
    }
    if (activeMenu === "book") {
      return renderBook();
    }
    if (activeMenu === "templates") {
      return renderTemplates();
    }
    if (activeMenu === "data-import") {
      return renderDataImport();
    }
    if (activeMenu === "qr") {
      return renderQr();
    }
    if (activeMenu === "serial") {
      return renderSerialGenerator();
    }
    if (activeMenu === "hot-folder") {
      return renderHotFolder();
    }
    if (activeMenu === "history") {
      return renderHistory();
    }
    return renderSettings();
  }

  return (
    <div className="imposition-app-shell">
      <aside className="imposition-sidebar">
        <div className="imposition-sidebar-brand">
          <span className="imposition-sidebar-brand-mark">IP</span>
        </div>
        <nav className="imposition-sidebar-nav" aria-label="Imposition navigation">
          {MENU_ITEMS.map((item) => (
            <SidebarButton key={item.id} item={item} activeId={activeMenu} onSelect={setActiveMenu} />
          ))}
        </nav>
        <div className="imposition-license-card">
          <div className="imposition-license-title">User Profile</div>
          <div className="imposition-license-line">
            <span>Licensed to</span>
            <strong>{licenseProfile.organization}</strong>
          </div>
          <div className="imposition-license-line">
            <span>Plan</span>
            <strong>{licenseProfile.plan}</strong>
          </div>
          <div className="imposition-license-line">
            <span>Devices</span>
            <strong>{licenseProfile.devicesUsed} / {licenseProfile.devicesAllowed}</strong>
          </div>
          <div className="imposition-license-line">
            <span>Status</span>
            <strong className={policy ? "is-active" : "is-inactive"}>{licenseProfile.status}</strong>
          </div>
          <div className="imposition-license-user">{licenseProfile.userName}</div>
          {!policy ? (
            <button type="button" className="btn btn-primary imposition-license-button" onClick={() => setActiveMenu("settings")}>
              Activate License
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary imposition-license-button" onClick={onBack}>
            Home
          </button>
        </div>
      </aside>

      <section className="imposition-workspace">
        <header className="imposition-topbar">
          <div>
            <div className="imposition-topbar-eyebrow">Digital Printing Press Imposition Software</div>
            <h1>{currentModuleLabel}</h1>
          </div>
          <div className="imposition-toolbar-actions">
            <div className="imposition-zoom-group">
              {ZOOM_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`imposition-toolbar-chip ${zoom === value ? "active" : ""}`}
                  onClick={() => setZoom(value)}
                >
                  {value === 140 ? "Fit" : `${value}%`}
                </button>
              ))}
            </div>
            <SelectInput
              label="Format"
              value={exportOptions.format}
              onChange={(value) => setExportOptions((current) => ({ ...current, format: value }))}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "png", label: "PNG" },
                { value: "tiff", label: "TIFF" },
              ]}
            />
            <SelectInput
              label="DPI"
              value={String(exportOptions.dpi)}
              onChange={(value) => setExportOptions((current) => ({ ...current, dpi: Number(value) }))}
              options={[
                { value: "300", label: "300 DPI" },
                { value: "600", label: "600 DPI" },
              ]}
            />
            <button type="button" className="btn btn-primary" onClick={queueExport}>
              Export {exportOptions.format.toUpperCase()}
            </button>
          </div>
        </header>

        <div className="imposition-main-grid">
          <div className="imposition-canvas-column">
            <CanvasPreview layout={currentLayout} bookPlan={activeMenu === "book" ? bookPlan : null} zoom={zoom} />
            <div className="imposition-canvas-footer">
              <span>Sheet Preview</span>
              <span>{activeSheet.label} | {currentLayout.summary.itemCount} up | {currentLayout.summary.sheetCount} sheets</span>
            </div>
          </div>
          <div className="imposition-inspector-column">
            {renderPrimaryPanel()}
            <section className="imposition-panel">
              <div className="imposition-panel-heading">
                <h3>Export Engine</h3>
                <span>PDF / PNG / TIFF</span>
              </div>
              <label className="imposition-check">
                <input
                  type="checkbox"
                  checked={exportOptions.cropMarks}
                  onChange={(event) => setExportOptions((current) => ({ ...current, cropMarks: event.target.checked }))}
                />
                <span>Crop marks</span>
              </label>
              <label className="imposition-check">
                <input
                  type="checkbox"
                  checked={exportOptions.bleedMarks}
                  onChange={(event) => setExportOptions((current) => ({ ...current, bleedMarks: event.target.checked }))}
                />
                <span>Bleed marks</span>
              </label>
              <label className="imposition-check">
                <input
                  type="checkbox"
                  checked={exportOptions.registrationMarks}
                  onChange={(event) => setExportOptions((current) => ({ ...current, registrationMarks: event.target.checked }))}
                />
                <span>Registration marks</span>
              </label>
              <div className="imposition-export-queue">
                {exportQueue.length === 0 ? (
                  <div className="imposition-muted-copy">No export jobs queued yet.</div>
                ) : (
                  exportQueue.map((job) => (
                    <article key={job.id} className="imposition-export-card">
                      <strong>{job.jobName}</strong>
                      <span>{job.format} | {job.dpi} DPI</span>
                      <span>{job.sheetCount} sheets | est. {job.estimatedMb} MB</span>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
