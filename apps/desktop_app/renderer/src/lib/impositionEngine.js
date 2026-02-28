const SHEET_PRESETS = {
  A4: { label: "A4", widthMm: 210, heightMm: 297 },
  A3: { label: "A3", widthMm: 297, heightMm: 420 },
  SRA3: { label: "SRA3", widthMm: 320, heightMm: 450 },
  "12x18": { label: "12 x 18", widthMm: 305, heightMm: 457 },
  "13x19": { label: "13 x 19", widthMm: 330, heightMm: 483 },
  Custom: { label: "Custom", widthMm: 330, heightMm: 483 },
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function getSheetPresets() {
  return SHEET_PRESETS;
}

export function resolveSheet(sheetKey, customWidthMm, customHeightMm) {
  const preset = SHEET_PRESETS[sheetKey] || SHEET_PRESETS.Custom;
  if (sheetKey !== "Custom") {
    return {
      key: sheetKey,
      label: preset.label,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
    };
  }
  return {
    key: "Custom",
    label: "Custom",
    widthMm: Math.max(40, toNumber(customWidthMm, preset.widthMm)),
    heightMm: Math.max(40, toNumber(customHeightMm, preset.heightMm)),
  };
}

function computeGridFit({
  sheetWidthMm,
  sheetHeightMm,
  itemWidthMm,
  itemHeightMm,
  marginMm,
  bleedMm,
  gapMm,
  rotated,
}) {
  const width = rotated ? itemHeightMm : itemWidthMm;
  const height = rotated ? itemWidthMm : itemHeightMm;
  const placedWidth = width + bleedMm * 2;
  const placedHeight = height + bleedMm * 2;
  const usableWidth = Math.max(0, sheetWidthMm - marginMm * 2);
  const usableHeight = Math.max(0, sheetHeightMm - marginMm * 2);
  const columns = Math.max(0, Math.floor((usableWidth + gapMm) / (placedWidth + gapMm)));
  const rows = Math.max(0, Math.floor((usableHeight + gapMm) / (placedHeight + gapMm)));
  const itemCount = columns * rows;
  const usedWidth = itemCount > 0 ? columns * placedWidth + Math.max(0, columns - 1) * gapMm : 0;
  const usedHeight = itemCount > 0 ? rows * placedHeight + Math.max(0, rows - 1) * gapMm : 0;
  return {
    rotated,
    width,
    height,
    placedWidth,
    placedHeight,
    usableWidth,
    usableHeight,
    columns,
    rows,
    itemCount,
    usedWidth,
    usedHeight,
    wasteAreaMm2: Math.max(0, usableWidth * usableHeight - usedWidth * usedHeight),
  };
}

export function optimizeSheetLayout({
  sheetKey,
  customSheetWidthMm,
  customSheetHeightMm,
  itemWidthMm,
  itemHeightMm,
  marginMm = 5,
  bleedMm = 2,
  gapMm = 2,
  allowRotation = true,
  quantity = 1,
}) {
  const sheet = resolveSheet(sheetKey, customSheetWidthMm, customSheetHeightMm);
  const fitNormal = computeGridFit({
    sheetWidthMm: sheet.widthMm,
    sheetHeightMm: sheet.heightMm,
    itemWidthMm,
    itemHeightMm,
    marginMm,
    bleedMm,
    gapMm,
    rotated: false,
  });
  const fitRotated = allowRotation
    ? computeGridFit({
        sheetWidthMm: sheet.widthMm,
        sheetHeightMm: sheet.heightMm,
        itemWidthMm,
        itemHeightMm,
        marginMm,
        bleedMm,
        gapMm,
        rotated: true,
      })
    : null;
  const bestFit =
    fitRotated &&
    (fitRotated.itemCount > fitNormal.itemCount ||
      (fitRotated.itemCount === fitNormal.itemCount &&
        fitRotated.wasteAreaMm2 < fitNormal.wasteAreaMm2))
      ? fitRotated
      : fitNormal;

  const originX = round((sheet.widthMm - bestFit.usedWidth) / 2);
  const originY = round((sheet.heightMm - bestFit.usedHeight) / 2);
  const placements = [];

  for (let row = 0; row < bestFit.rows; row += 1) {
    for (let column = 0; column < bestFit.columns; column += 1) {
      const x = originX + column * (bestFit.placedWidth + gapMm);
      const y = originY + row * (bestFit.placedHeight + gapMm);
      placements.push({
        index: placements.length + 1,
        x: round(x),
        y: round(y),
        widthMm: round(bestFit.width),
        heightMm: round(bestFit.height),
        bleedMm,
        rotated: bestFit.rotated,
      });
    }
  }

  const sheetCount = bestFit.itemCount > 0 ? Math.ceil(Math.max(1, quantity) / bestFit.itemCount) : 0;
  const usedAreaMm2 = bestFit.usedWidth * bestFit.usedHeight;
  const totalUsableMm2 = bestFit.usableWidth * bestFit.usableHeight;
  const efficiency = totalUsableMm2 > 0 ? round((usedAreaMm2 / totalUsableMm2) * 100, 1) : 0;

  return {
    sheet,
    item: {
      widthMm: round(itemWidthMm),
      heightMm: round(itemHeightMm),
    },
    summary: {
      columns: bestFit.columns,
      rows: bestFit.rows,
      itemCount: bestFit.itemCount,
      sheetCount,
      efficiency,
      rotated: bestFit.rotated,
      usedWidthMm: round(bestFit.usedWidth),
      usedHeightMm: round(bestFit.usedHeight),
      wasteAreaMm2: round(bestFit.wasteAreaMm2),
    },
    settings: {
      marginMm: round(marginMm),
      bleedMm: round(bleedMm),
      gapMm: round(gapMm),
      allowRotation,
      quantity: Math.max(1, Math.floor(toNumber(quantity, 1))),
    },
    placements,
  };
}

function padPageCount(pageCount) {
  const pages = Math.max(4, Math.floor(toNumber(pageCount, 4)));
  const remainder = pages % 4;
  return remainder === 0 ? pages : pages + (4 - remainder);
}

function buildSaddleSignature(startPage, endPage) {
  const spreads = [];
  let low = startPage;
  let high = endPage;
  while (low < high) {
    spreads.push({
      front: { left: high, right: low },
      back: { left: low + 1, right: high - 1 },
    });
    low += 2;
    high -= 2;
  }
  return spreads;
}

export function buildBookImposition({
  totalPages,
  bindingType = "center-staple",
  signatureSize = 16,
  pageWidthMm = 148,
  pageHeightMm = 210,
  sheetKey = "SRA3",
  customSheetWidthMm,
  customSheetHeightMm,
}) {
  const paddedPages = padPageCount(totalPages);
  const sheet = resolveSheet(sheetKey, customSheetWidthMm, customSheetHeightMm);
  const sections = [];
  const sectionSize = bindingType === "perfect-binding"
    ? Math.max(4, Math.floor(toNumber(signatureSize, 16) / 4) * 4)
    : paddedPages;

  let cursor = 1;
  while (cursor <= paddedPages) {
    const endPage = Math.min(paddedPages, cursor + sectionSize - 1);
    sections.push({
      label: bindingType === "perfect-binding" ? `Signature ${sections.length + 1}` : "Book Block",
      spreads: buildSaddleSignature(cursor, endPage),
      startPage: cursor,
      endPage,
    });
    cursor = endPage + 1;
  }

  const flatWidthMm = pageWidthMm * 2;
  const flatHeightMm = pageHeightMm;
  const coverLayout = optimizeSheetLayout({
    sheetKey,
    customSheetWidthMm,
    customSheetHeightMm,
    itemWidthMm: flatWidthMm,
    itemHeightMm: flatHeightMm,
    marginMm: 8,
    bleedMm: 3,
    gapMm: 6,
    allowRotation: false,
    quantity: sections.reduce((count, section) => count + section.spreads.length * 2, 0),
  });

  return {
    bindingType,
    totalPages: Math.max(1, Math.floor(toNumber(totalPages, 1))),
    paddedPages,
    pageSize: {
      widthMm: round(pageWidthMm),
      heightMm: round(pageHeightMm),
    },
    sheet,
    sections,
    layout: coverLayout,
  };
}

export function buildExportPlan({
  jobName,
  moduleName,
  format = "pdf",
  dpi = 300,
  includeCropMarks = true,
  includeBleedMarks = true,
  includeRegistrationMarks = false,
  layout,
}) {
  const itemCount = layout?.summary?.itemCount || 0;
  const sheetCount = layout?.summary?.sheetCount || 0;
  const estimatedMb = round(Math.max(1.2, (sheetCount || 1) * (dpi / 300) * 2.4), 1);
  return {
    id: `${moduleName}-${Date.now()}`,
    jobName,
    moduleName,
    format: String(format || "pdf").toUpperCase(),
    dpi: Math.max(72, Math.floor(toNumber(dpi, 300))),
    marks: {
      crop: Boolean(includeCropMarks),
      bleed: Boolean(includeBleedMarks),
      registration: Boolean(includeRegistrationMarks),
    },
    outputName: `${jobName.replace(/\s+/g, "-").toLowerCase()}.${format}`,
    itemCount,
    sheetCount,
    estimatedMb,
    createdAt: new Date().toISOString(),
  };
}

export function buildHotFolderRecipe({ folderPath, moduleName, format, dpi, layout }) {
  return {
    folderPath: folderPath || "/hotfolder/press-jobs",
    moduleName,
    watchMode: "continuous",
    trigger: "on-file-create",
    outputPattern: `${moduleName.toLowerCase().replace(/\s+/g, "-")}-{timestamp}.${format.toLowerCase()}`,
    renderProfile: {
      format,
      dpi,
      estimatedSheets: layout?.summary?.sheetCount || 0,
      itemsPerSheet: layout?.summary?.itemCount || 0,
    },
  };
}

export function buildSerialPreview(prefix = "JOB", count = 12) {
  return Array.from({ length: count }).map((_, index) => {
    const serial = String(index + 1).padStart(4, "0");
    return `${prefix}-${new Date().getFullYear()}-${serial}`;
  });
}

export function buildQrBarcodePreview() {
  return [
    { label: "QR", usage: "Job ticket, make-ready instructions" },
    { label: "EAN13", usage: "Retail label and carton code" },
    { label: "CODE128", usage: "Variable data sheet tracking" },
  ];
}
