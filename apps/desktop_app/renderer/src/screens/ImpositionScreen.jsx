import { useEffect, useMemo, useState } from "react";

const DEFAULT_MAPPING = {
  ID: "employee_id",
  Name: "employee_name",
  Department: "department",
  Photo: "photo",
  Designation: "designation",
};

export default function ImpositionScreen({ onBack }) {
  const [licenseCode, setLicenseCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [policy, setPolicy] = useState(null);

  const [qrForm, setQrForm] = useState({
    sourceType: "id_number",
    idNumber: "",
    url: "",
    customText: "",
    barcodeType: "qr_code",
    qrSize: 80,
    qrPosition: "bottom_right",
    margin: 4,
  });
  const [qrBusy, setQrBusy] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [qrError, setQrError] = useState("");

  const [bulkForm, setBulkForm] = useState({
    importType: "id_card",
    sheetSize: "A4",
    cardWidthMm: 54,
    cardHeightMm: 86,
    marginMm: 5,
    gapMm: 2,
  });
  const [fieldMapping, setFieldMapping] = useState(DEFAULT_MAPPING);
  const [bulkFilePath, setBulkFilePath] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [bulkLayoutResult, setBulkLayoutResult] = useState(null);
  const [bulkExportLinks, setBulkExportLinks] = useState({});

  useEffect(() => {
    let active = true;
    async function loadPolicy() {
      try {
        const response = await window.storageApi.getImpositionPolicy?.();
        if (!active) {
          return;
        }
        setPolicy(response?.policy || null);
      } catch {
        if (active) {
          setPolicy(null);
        }
      }
    }
    loadPolicy();
    return () => {
      active = false;
    };
  }, []);

  const features = policy?.plan?.feature_flags || {};

  const higherPlanEnabled = useMemo(() => {
    return Boolean(
      features.excel_data_import ||
      features.id_card_data_update ||
      features.business_card_data_update ||
      features.bulk_card_generation
    );
  }, [features]);

  function mapErrorCode(rawCode, fallback = "Request failed.") {
    const code = String(rawCode || "").trim();
    if (!code) {
      return fallback;
    }
    if (code === "plan_feature_locked") {
      return "This feature is available only in Business and Enterprise plans.";
    }
    if (code === "plan_feature_locked_qr_barcode") {
      return "QR & Barcode Generator is available only in Business and Enterprise plans.";
    }
    if (code === "unsupported_file_type") {
      return "Only .xlsx and .csv files are supported.";
    }
    if (code === "file_required") {
      return "Choose an Excel/CSV file first.";
    }
    if (code === "import_id_required") {
      return "Upload data before generating layout.";
    }
    if (code === "job_id_required") {
      return "Generate bulk layout before export.";
    }
    if (code === "device_limit_exceeded") {
      return "Device limit exceeded for this plan.";
    }
    if (code === "license_invalid") {
      return "Invalid or inactive license code.";
    }
    return code;
  }

  async function activateDevice() {
    setError("");
    setMessage("");
    const code = String(licenseCode || "").trim();
    if (!code) {
      setError("License code is required.");
      return;
    }
    setBusy(true);
    try {
      await window.storageApi.validateImpositionLicense({ license_code: code });
      const registerResp = await window.storageApi.registerImpositionDevice({ license_code: code });
      setPolicy(registerResp?.policy || null);
      setMessage("Device registered successfully.");
    } catch (e) {
      const codeOrMsg = String(e?.code || e?.message || "activation_failed");
      setError(mapErrorCode(codeOrMsg, "Activation failed."));
    } finally {
      setBusy(false);
    }
  }

  async function checkDevice() {
    setError("");
    setMessage("");
    const code = String(licenseCode || policy?.license_code || "").trim();
    if (!code) {
      setError("Enter license code first.");
      return;
    }
    setBusy(true);
    try {
      const resp = await window.storageApi.checkImpositionDevice({ license_code: code });
      setPolicy(resp?.policy || policy);
      setMessage("Device is active for this license.");
    } catch (e) {
      setError(mapErrorCode(String(e?.code || e?.message || "device_check_failed"), "Check failed."));
    } finally {
      setBusy(false);
    }
  }

  async function generateQrBarcode() {
    setQrError("");
    setQrResult(null);
    setQrBusy(true);
    try {
      const payload = {
        source_type: qrForm.sourceType,
        id_number: qrForm.idNumber,
        url: qrForm.url,
        custom_text: qrForm.customText,
        barcode_type: qrForm.barcodeType,
        qr_size: Number(qrForm.qrSize || 80),
        qr_position: qrForm.qrPosition,
        margin: Number(qrForm.margin || 4),
      };
      const resp = await window.storageApi.generateImpositionQrBarcode(payload);
      setQrResult(resp?.artifact || null);
    } catch (e) {
      const code = String(e?.code || e?.message || "imposition_qr_barcode_generate_failed");
      setQrError(mapErrorCode(code, "QR/Barcode generation failed."));
    } finally {
      setQrBusy(false);
    }
  }

  function onPickBulkFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) {
      setBulkFilePath("");
      setBulkFileName("");
      return;
    }
    const pathValue = String(file.path || "");
    setBulkFilePath(pathValue);
    setBulkFileName(file.name || pathValue.split(/[\\/]/).pop() || "");
  }

  async function uploadBulkData() {
    setBulkError("");
    setBulkLayoutResult(null);
    setBulkExportLinks({});
    if (!bulkFilePath) {
      setBulkError("Choose an Excel/CSV file first.");
      return;
    }
    setBulkBusy(true);
    try {
      const response = await window.storageApi.uploadImpositionBulkImport({
        filePath: bulkFilePath,
        importType: bulkForm.importType,
        fieldMapping,
        qrBarcode: {
          enabled: true,
          source_type: "id_number",
          barcode_type: "qr_code",
          qr_size: Number(qrForm.qrSize || 80),
          qr_position: qrForm.qrPosition,
          margin: Number(qrForm.margin || 4),
        },
      });
      setBulkImportResult(response || null);
      setMessage(`Bulk import uploaded. Records: ${response?.row_count || 0}`);
    } catch (e) {
      const code = String(e?.code || e?.message || "bulk_import_upload_failed");
      setBulkError(mapErrorCode(code, "Bulk import failed."));
    } finally {
      setBulkBusy(false);
    }
  }

  async function generateBulkLayout() {
    setBulkError("");
    setBulkExportLinks({});
    const importId = bulkImportResult?.import_id;
    if (!importId) {
      setBulkError("Upload data before generating layout.");
      return;
    }
    setBulkBusy(true);
    try {
      const response = await window.storageApi.generateImpositionBulkLayout({
        import_id: importId,
        sheet_size: bulkForm.sheetSize,
        card_width_mm: Number(bulkForm.cardWidthMm || 54),
        card_height_mm: Number(bulkForm.cardHeightMm || 86),
        margin_mm: Number(bulkForm.marginMm || 5),
        gap_mm: Number(bulkForm.gapMm || 2),
      });
      setBulkLayoutResult(response || null);
      setMessage(response?.example || "Bulk layout generated.");
    } catch (e) {
      const code = String(e?.code || e?.message || "imposition_bulk_layout_failed");
      setBulkError(mapErrorCode(code, "Bulk layout generation failed."));
    } finally {
      setBulkBusy(false);
    }
  }

  async function exportBulk(format) {
    setBulkError("");
    const jobId = bulkLayoutResult?.job_id;
    if (!jobId) {
      setBulkError("Generate bulk layout before export.");
      return;
    }
    setBulkBusy(true);
    try {
      const response = await window.storageApi.exportImpositionBulk({ job_id: jobId, format });
      const url = String(response?.download_url || "");
      if (url) {
        setBulkExportLinks((prev) => ({ ...prev, [format]: url }));
      }
      setMessage(`Export ready: ${format.toUpperCase()}`);
    } catch (e) {
      const code = String(e?.code || e?.message || "imposition_bulk_export_failed");
      setBulkError(mapErrorCode(code, "Bulk export failed."));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="module-shell">
      <div className="module-header">
        <div>
          <h1>Imposition Software</h1>
          <p>License based activation for ID Card and Business Card imposition.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          Back
        </button>
      </div>

      <section className="card">
        <h2 className="card-title">License Activation</h2>
        <div className="monitor-input-row">
          <label>
            License Code
            <input
              type="text"
              value={licenseCode}
              onChange={(event) => setLicenseCode(event.target.value)}
              placeholder="IMP-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
            />
          </label>
          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={activateDevice} disabled={busy}>
              {busy ? "Please wait..." : "Validate & Register"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={checkDevice} disabled={busy}>
              Check Device
            </button>
          </div>
        </div>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {message ? <div className="alert alert-info">{message}</div> : null}
      </section>

      <section className="card">
        <h2 className="card-title">Plan Policy</h2>
        {policy ? (
          <div className="card-grid">
            <div>
              <div className="card-muted">Plan</div>
              <div className="card-value">{policy.plan?.name || "-"}</div>
            </div>
            <div>
              <div className="card-muted">Device Limit</div>
              <div className="card-value">{policy.plan?.device_limit ?? 0}</div>
            </div>
            <div>
              <div className="card-muted">Offline Grace</div>
              <div className="card-value">{policy.offline_grace_days ?? 0} days</div>
            </div>
            <div>
              <div className="card-muted">Verify Every</div>
              <div className="card-value">{policy.verify_every_hours ?? 24} hours</div>
            </div>
          </div>
        ) : (
          <p className="text-muted">Activate a valid license to load policy.</p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Feature Flags</h2>
        {!policy ? (
          <p className="text-muted">No plan loaded.</p>
        ) : (
          <div className="card-grid">
            {Object.entries(features).map(([key, enabled]) => (
              <div key={key} className="row">
                <span>{key.replace(/_/g, " ")}</span>
                <strong>{enabled ? "Enabled" : "Disabled"}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">QR & Barcode Generator</h2>
        <p className="text-muted">Generate QR/Barcode for ID number, URL, or custom text and place it in card layout.</p>
        <div className="monitor-input-row">
          <label>
            Source
            <select
              value={qrForm.sourceType}
              onChange={(event) => setQrForm((prev) => ({ ...prev, sourceType: event.target.value }))}
            >
              <option value="id_number">ID Number</option>
              <option value="url">URL</option>
              <option value="custom_text">Custom Text</option>
            </select>
          </label>
          <label>
            Barcode Type
            <select
              value={qrForm.barcodeType}
              onChange={(event) => setQrForm((prev) => ({ ...prev, barcodeType: event.target.value }))}
            >
              <option value="qr_code">QR Code</option>
              <option value="code128">Code128</option>
              <option value="ean13">EAN13</option>
            </select>
          </label>
          <label>
            QR Size
            <input
              type="number"
              min="24"
              max="400"
              value={qrForm.qrSize}
              onChange={(event) => setQrForm((prev) => ({ ...prev, qrSize: event.target.value }))}
            />
          </label>
          <label>
            QR Position
            <select
              value={qrForm.qrPosition}
              onChange={(event) => setQrForm((prev) => ({ ...prev, qrPosition: event.target.value }))}
            >
              <option value="top_left">Top Left</option>
              <option value="top_right">Top Right</option>
              <option value="middle_center">Middle Center</option>
              <option value="bottom_left">Bottom Left</option>
              <option value="bottom_right">Bottom Right</option>
            </select>
          </label>
          <label>
            Margin
            <input
              type="number"
              min="0"
              max="100"
              value={qrForm.margin}
              onChange={(event) => setQrForm((prev) => ({ ...prev, margin: event.target.value }))}
            />
          </label>
        </div>
        <div className="monitor-input-row">
          <label>
            ID Number
            <input
              type="text"
              value={qrForm.idNumber}
              onChange={(event) => setQrForm((prev) => ({ ...prev, idNumber: event.target.value }))}
              placeholder="1001"
            />
          </label>
          <label>
            URL
            <input
              type="text"
              value={qrForm.url}
              onChange={(event) => setQrForm((prev) => ({ ...prev, url: event.target.value }))}
              placeholder="https://company.com/id/1001"
            />
          </label>
          <label>
            Custom Text
            <input
              type="text"
              value={qrForm.customText}
              onChange={(event) => setQrForm((prev) => ({ ...prev, customText: event.target.value }))}
              placeholder="EMP-1001"
            />
          </label>
        </div>
        <div className="button-row">
          <button className="btn btn-primary" type="button" onClick={generateQrBarcode} disabled={qrBusy}>
            {qrBusy ? "Generating..." : "Generate QR / Barcode"}
          </button>
        </div>
        {qrError ? <div className="alert alert-danger">{qrError}</div> : null}
        {qrResult ? (
          <div className="card-grid">
            <div>
              <div className="card-muted">Type</div>
              <div className="card-value">{qrResult.barcode_type}</div>
            </div>
            <div>
              <div className="card-muted">Content</div>
              <div className="card-value">{qrResult.content}</div>
            </div>
            <div>
              <div className="card-muted">Preview URL</div>
              <div className="card-value">
                <a href={qrResult.render_url} target="_blank" rel="noreferrer">{qrResult.render_url}</a>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card-title">Excel Bulk Data Import</h2>
        <p className="text-muted">Upload .xlsx/.csv, map fields, auto build imposition sheets, and export PDF/PNG/TIFF.</p>
        {!higherPlanEnabled ? (
          <div className="alert alert-danger">Available only in Business and Enterprise plans.</div>
        ) : null}

        <div className="monitor-input-row">
          <label>
            Import Type
            <select
              value={bulkForm.importType}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, importType: event.target.value }))}
            >
              <option value="id_card">ID Card</option>
              <option value="business_card">Business Card</option>
            </select>
          </label>
          <label>
            Excel/CSV File
            <input type="file" accept=".xlsx,.csv" onChange={onPickBulkFile} />
          </label>
          <div>
            <div className="card-muted">Selected File</div>
            <div className="card-value">{bulkFileName || "No file selected"}</div>
          </div>
        </div>

        <div className="monitor-input-row">
          <label>
            Excel ID Field
            <input
              type="text"
              value={fieldMapping.ID || ""}
              onChange={(event) => setFieldMapping((prev) => ({ ...prev, ID: event.target.value }))}
              placeholder="employee_id"
            />
          </label>
          <label>
            Excel Name Field
            <input
              type="text"
              value={fieldMapping.Name || ""}
              onChange={(event) => setFieldMapping((prev) => ({ ...prev, Name: event.target.value }))}
              placeholder="employee_name"
            />
          </label>
          <label>
            Excel Department Field
            <input
              type="text"
              value={fieldMapping.Department || ""}
              onChange={(event) => setFieldMapping((prev) => ({ ...prev, Department: event.target.value }))}
              placeholder="department"
            />
          </label>
          <label>
            Excel Photo Field
            <input
              type="text"
              value={fieldMapping.Photo || ""}
              onChange={(event) => setFieldMapping((prev) => ({ ...prev, Photo: event.target.value }))}
              placeholder="photo"
            />
          </label>
          <label>
            Excel Designation Field
            <input
              type="text"
              value={fieldMapping.Designation || ""}
              onChange={(event) => setFieldMapping((prev) => ({ ...prev, Designation: event.target.value }))}
              placeholder="designation"
            />
          </label>
        </div>

        <div className="button-row">
          <button className="btn btn-primary" type="button" onClick={uploadBulkData} disabled={bulkBusy || !higherPlanEnabled}>
            {bulkBusy ? "Processing..." : "Upload & Map Data"}
          </button>
        </div>

        <div className="monitor-input-row">
          <label>
            Sheet Size
            <select
              value={bulkForm.sheetSize}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, sheetSize: event.target.value }))}
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label>
            Card Width (mm)
            <input
              type="number"
              min="20"
              max="200"
              value={bulkForm.cardWidthMm}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, cardWidthMm: event.target.value }))}
            />
          </label>
          <label>
            Card Height (mm)
            <input
              type="number"
              min="20"
              max="200"
              value={bulkForm.cardHeightMm}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, cardHeightMm: event.target.value }))}
            />
          </label>
          <label>
            Margin (mm)
            <input
              type="number"
              min="0"
              max="50"
              value={bulkForm.marginMm}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, marginMm: event.target.value }))}
            />
          </label>
          <label>
            Gap (mm)
            <input
              type="number"
              min="0"
              max="20"
              value={bulkForm.gapMm}
              onChange={(event) => setBulkForm((prev) => ({ ...prev, gapMm: event.target.value }))}
            />
          </label>
        </div>

        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={generateBulkLayout} disabled={bulkBusy || !bulkImportResult}>
            Generate Bulk Imposition Layout
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportBulk("pdf")} disabled={bulkBusy || !bulkLayoutResult}>
            Export PDF
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportBulk("png")} disabled={bulkBusy || !bulkLayoutResult}>
            Export PNG
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportBulk("tiff")} disabled={bulkBusy || !bulkLayoutResult}>
            Export TIFF
          </button>
        </div>

        {bulkError ? <div className="alert alert-danger">{bulkError}</div> : null}

        {bulkImportResult ? (
          <div className="card-grid">
            <div>
              <div className="card-muted">Records Imported</div>
              <div className="card-value">{bulkImportResult.row_count}</div>
            </div>
            <div>
              <div className="card-muted">Import ID</div>
              <div className="card-value">{bulkImportResult.import_id}</div>
            </div>
            <div>
              <div className="card-muted">Preview Rows</div>
              <div className="card-value">{Array.isArray(bulkImportResult.preview) ? bulkImportResult.preview.length : 0}</div>
            </div>
          </div>
        ) : null}

        {bulkLayoutResult?.layout ? (
          <div className="card-grid">
            <div>
              <div className="card-muted">Cards / Sheet</div>
              <div className="card-value">{bulkLayoutResult.layout.cards_per_sheet}</div>
            </div>
            <div>
              <div className="card-muted">Total Sheets</div>
              <div className="card-value">{bulkLayoutResult.layout.total_sheets}</div>
            </div>
            <div>
              <div className="card-muted">Total Records</div>
              <div className="card-value">{bulkLayoutResult.layout.total_records}</div>
            </div>
          </div>
        ) : null}

        {Object.keys(bulkExportLinks).length ? (
          <div className="card-grid">
            {Object.entries(bulkExportLinks).map(([fmt, link]) => (
              <div key={fmt}>
                <div className="card-muted">{fmt.toUpperCase()} Download</div>
                <div className="card-value">
                  <a href={link} target="_blank" rel="noreferrer">{link}</a>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
