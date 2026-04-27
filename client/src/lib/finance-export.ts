/**
 * Finance report export utilities — PDF (jsPDF + autotable) and Excel (ExcelJS).
 * Used by VAT report, Balance Sheet, Income Statement, and Trial Balance pages.
 */

import type { Fill, Font, Border } from "exceljs";

const COMPANY_NAME = "مصنع تيك للأثاث";
const COMPANY_NAME_EN = "Teak Furniture Factory";

// ─── Arabic font loading ─────────────────────────────────────────────────────
// Amiri is a high-quality Arabic serif font bundled in client/public.
// It is served at /Amiri-Regular.ttf by Vite's static asset server.
// This avoids any external CDN dependency for official/offline filing.
const AMIRI_LOCAL_PATH = "/Amiri-Regular.ttf";

let amiriFontBase64: string | null = null;

async function loadAmirifont(): Promise<string | null> {
  if (amiriFontBase64 !== null) return amiriFontBase64;
  try {
    const resp = await fetch(AMIRI_LOCAL_PATH);
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    amiriFontBase64 = btoa(binary);
    return amiriFontBase64;
  } catch {
    return null;
  }
}

function applyArabicFont(doc: import("jspdf").jsPDF, fontBase64: string | null): string {
  if (!fontBase64) return "helvetica";
  doc.addFileToVFS("Amiri-Regular.ttf", fontBase64);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  return "Amiri";
}

// ─── PDF ────────────────────────────────────────────────────────────────────

export interface PdfSection {
  title?: string;
  head: string[][];
  body: (string | number)[][];
  footRow?: (string | number)[];
}

export async function exportReportPDF(
  reportTitle: string,
  periodLabel: string,
  sections: PdfSection[],
  filename: string,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const fontBase64 = await loadAmirifont();
  const arabicFont = applyArabicFont(doc, fontBase64);

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;

  // ─── Header ─────────────────────────────────────────────────────────────
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, 26, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont(arabicFont, "normal");

  doc.setFontSize(14);
  doc.text(COMPANY_NAME_EN, margin, 11);

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-SA")}`, margin, 18);

  // Report title (right side)
  doc.setFontSize(13);
  doc.text(reportTitle, pageW - margin, 11, { align: "right" });

  doc.setFontSize(9);
  doc.text(periodLabel, pageW - margin, 18, { align: "right" });

  doc.setTextColor(0, 0, 0);

  let startY = 32;

  for (const section of sections) {
    if (section.title) {
      doc.setFontSize(10);
      doc.setFont(arabicFont, "normal");
      doc.setTextColor(30, 64, 175);
      doc.text(section.title, pageW - margin, startY, { align: "right" });
      doc.setTextColor(0, 0, 0);
      startY += 5;
    }

    const foot = section.footRow ? [section.footRow.map(String)] : undefined;

    autoTable(doc, {
      head: section.head,
      body: section.body.map((row) => row.map(String)),
      foot,
      startY,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        halign: "right",
        font: arabicFont,
      },
      headStyles: {
        fillColor: [30, 64, 175] as [number, number, number],
        textColor: 255,
        fontStyle: "bold",
        halign: "right",
        font: arabicFont,
      },
      footStyles: {
        fillColor: [240, 240, 240] as [number, number, number],
        textColor: [0, 0, 0] as [number, number, number],
        fontStyle: "bold",
        halign: "right",
        font: arabicFont,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      didDrawPage: () => {
        const pg = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `${COMPANY_NAME_EN} — ${reportTitle}  |  Page ${pg}`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: "center" },
        );
        doc.setTextColor(0, 0, 0);
      },
    });

    const lastTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
    startY = lastTable.finalY + 8;
  }

  doc.save(filename);
}

// ─── Excel ───────────────────────────────────────────────────────────────────

export interface ExcelSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, string | number>[];
  totalsRow?: Record<string, string | number>;
}

export async function exportReportExcel(
  reportTitle: string,
  periodLabel: string,
  sheets: ExcelSheet[],
  filename: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = COMPANY_NAME_EN;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = reportTitle;

  const HEADER_FILL: Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" },
  };

  const HEADER_FONT: Partial<Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 10,
  };

  const TITLE_FONT: Partial<Font> = { bold: true, size: 13 };

  const TOTALS_FILL: Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  const TOTALS_BORDER: Partial<Border> = {
    style: "medium",
    color: { argb: "FF1E40AF" },
  };

  const ALT_FILL: Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  };

  for (const sheetDef of sheets) {
    const ws = workbook.addWorksheet(sheetDef.name, {
      views: [{ rightToLeft: true }],
    });

    // ── Company + report title rows ──────────────────────────────────────
    ws.mergeCells(1, 1, 1, sheetDef.columns.length);
    const titleCell = ws.getCell("A1");
    titleCell.value = `${COMPANY_NAME} — ${reportTitle}`;
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { horizontal: "center" };

    ws.mergeCells(2, 1, 2, sheetDef.columns.length);
    const periodCell = ws.getCell("A2");
    periodCell.value = periodLabel;
    periodCell.font = { italic: true, size: 10 };
    periodCell.alignment = { horizontal: "center" };

    ws.addRow([]);

    // ── Column headers ───────────────────────────────────────────────────
    const headerRow = ws.addRow(sheetDef.columns.map((c) => c.header));
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "right" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
      };
    });

    ws.columns = sheetDef.columns.map((c) => ({
      key: c.key,
      width: c.width ?? 20,
    }));

    // ── Data rows ────────────────────────────────────────────────────────
    sheetDef.rows.forEach((rowData, i) => {
      const row = ws.addRow(sheetDef.columns.map((c) => rowData[c.key] ?? ""));
      row.eachCell((cell) => {
        cell.alignment = { horizontal: "right" };
        if (i % 2 === 1) {
          cell.fill = ALT_FILL;
        }
      });
    });

    // ── Totals row ───────────────────────────────────────────────────────
    if (sheetDef.totalsRow) {
      const tRow = ws.addRow(
        sheetDef.columns.map((c) => sheetDef.totalsRow![c.key] ?? ""),
      );
      tRow.eachCell((cell) => {
        cell.fill = TOTALS_FILL;
        cell.font = { bold: true };
        cell.alignment = { horizontal: "right" };
        cell.border = { top: TOTALS_BORDER };
      });
    }
  }

  // ── Trigger download ─────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
