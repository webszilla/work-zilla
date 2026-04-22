function toPlainCellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((segment) => String(segment?.text || "")).join("");
    }
    if (typeof value.text === "string") {
      return value.text;
    }
    if (value.result != null) {
      return String(value.result);
    }
    if (typeof value.hyperlink === "string") {
      return String(value.text || value.hyperlink);
    }
    if (typeof value.formula === "string") {
      return String(value.result ?? value.formula);
    }
  }
  return String(value);
}

export async function readSpreadsheetRows(file) {
  const fileName = String(file?.name || "").trim().toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    return [];
  }
  if (fileName.endsWith(".xls")) {
    throw new Error("Legacy .xls format is not supported. Please convert to .xlsx.");
  }

  const [{ Workbook }, buffer] = await Promise.all([
    import("exceljs"),
    file.arrayBuffer(),
  ]);

  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map((cell) => toPlainCellValue(cell)));
  });
  return rows;
}
