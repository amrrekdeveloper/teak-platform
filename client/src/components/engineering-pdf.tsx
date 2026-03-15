import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import type { jsPDF as JsPDFType } from "jspdf";

interface DoorSpec {
  wallIndex: number;
  position: number;
  width: number;
}

interface WindowSpec {
  wallIndex: number;
  position: number;
  width: number;
}

interface WallSpec {
  index: number;
  length: number;
}

interface RoomData {
  length?: number;
  width?: number;
  height?: number;
  walls?: WallSpec[];
  doors?: DoorSpec[];
  windows?: WindowSpec[];
}

interface ProductItem {
  code?: string;
  description?: string;
  nameAr?: string;
  nameEn?: string;
  width?: number;
  height?: number;
  depth?: number;
  designW?: number;
  designH?: number;
  designD?: number;
  manufacturingW?: number;
  manufacturingH?: number;
  manufacturingD?: number;
  price?: number;
  quantity?: number;
  wallIndex?: number;
  position?: number;
}

interface EngineeringPdfProps {
  roomData: RoomData;
  products: ProductItem[];
  customerName: string;
  projectTitle?: string;
  quotationNumber?: string | number;
  companyName?: string;
  companyLogo?: string;
}

interface AutoTableOptions {
  startY: number;
  head: string[][];
  body: string[][];
  theme: string;
  styles: Record<string, unknown>;
  headStyles: Record<string, unknown>;
  alternateRowStyles: Record<string, unknown>;
  columnStyles: Record<number, Record<string, unknown>>;
  margin: Record<string, number>;
}

interface JsPDFWithAutoTable extends JsPDFType {
  autoTable: (options: AutoTableOptions) => void;
  lastAutoTable?: { finalY: number };
}

export function ExportEngineeringPdfButton({
  roomData,
  products,
  customerName,
  projectTitle,
  quotationNumber,
  companyName,
  companyLogo,
}: EngineeringPdfProps) {
  const { t } = useLanguage();
  const [generating, setGenerating] = useState(false);

  const handleExport = async () => {
    setGenerating(true);
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }) as unknown as JsPDFWithAutoTable;
      const pageW = 297;
      const pageH = 210;
      const margin = 12;
      const drawW = pageW - margin * 2;
      const drawH = pageH - margin * 2 - 30;

      doc.setFont("helvetica");

      const headerY = margin;
      doc.setFillColor(26, 54, 93);
      doc.rect(margin, headerY, drawW, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text(projectTitle || "Engineering Drawing", pageW / 2, headerY + 7, { align: "center" });
      doc.setFontSize(9);
      doc.text(`${customerName} | #${quotationNumber || ""}`, pageW / 2, headerY + 13, { align: "center" });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      const displayCompanyName = companyName || "Teak Wood Products Factory";
      doc.text(displayCompanyName, margin + 2, headerY + 17 + 5);
      doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, pageW - margin - 2, headerY + 17 + 5, { align: "right" });

      const roomL = roomData.length || 400;
      const roomW = roomData.width || 300;
      const roomH = roomData.height || 270;

      const drawAreaTop = headerY + 26;
      const drawAreaH = drawH - 10;
      const drawAreaW = drawW - 60;

      const scaleX = drawAreaW / (roomL / 10);
      const scaleY = drawAreaH / (roomW / 10);
      const scale = Math.min(scaleX, scaleY) * 0.75;

      const roomDrawW = (roomL / 10) * scale;
      const roomDrawH = (roomW / 10) * scale;
      const roomX = margin + (drawAreaW - roomDrawW) / 2 + 10;
      const roomY = drawAreaTop + (drawAreaH - roomDrawH) / 2;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(roomX, roomY, roomDrawW, roomDrawH);

      doc.setFillColor(245, 245, 245);
      doc.rect(roomX + 0.5, roomY + 0.5, roomDrawW - 1, roomDrawH - 1, "F");
      doc.rect(roomX, roomY, roomDrawW, roomDrawH);

      doc.setLineWidth(0.2);
      doc.setDrawColor(100, 100, 100);
      const wallThickness = 3;
      doc.setFillColor(80, 80, 80);
      doc.rect(roomX - wallThickness, roomY - wallThickness, roomDrawW + wallThickness * 2, wallThickness, "F");
      doc.rect(roomX - wallThickness, roomY + roomDrawH, roomDrawW + wallThickness * 2, wallThickness, "F");
      doc.rect(roomX - wallThickness, roomY, wallThickness, roomDrawH, "F");
      doc.rect(roomX + roomDrawW, roomY, wallThickness, roomDrawH, "F");

      const doors: DoorSpec[] = roomData.doors || [];
      doors.forEach((door) => {
        const doorW = (door.width / 10) * scale;
        const doorPos = (door.position / 10) * scale;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(139, 69, 19);
        doc.setLineWidth(0.4);

        if (door.wallIndex === 0) {
          doc.rect(roomX + doorPos, roomY - wallThickness, doorW, wallThickness, "FD");
          doc.setDrawColor(139, 69, 19);
          doc.setLineWidth(0.2);
          drawArc(doc, roomX + doorPos, roomY, doorW, "down");
        } else if (door.wallIndex === 2) {
          doc.rect(roomX + doorPos, roomY + roomDrawH, doorW, wallThickness, "FD");
          drawArc(doc, roomX + doorPos, roomY + roomDrawH, doorW, "up");
        } else if (door.wallIndex === 3) {
          doc.rect(roomX - wallThickness, roomY + doorPos, wallThickness, doorW, "FD");
          drawArc(doc, roomX, roomY + doorPos, doorW, "right");
        } else if (door.wallIndex === 1) {
          doc.rect(roomX + roomDrawW, roomY + doorPos, wallThickness, doorW, "FD");
          drawArc(doc, roomX + roomDrawW, roomY + doorPos, doorW, "left");
        }
      });

      const windows: WindowSpec[] = roomData.windows || [];
      windows.forEach((win) => {
        const winW = (win.width / 10) * scale;
        const winPos = (win.position / 10) * scale;
        doc.setDrawColor(0, 120, 215);
        doc.setLineWidth(0.6);

        if (win.wallIndex === 0) {
          const y = roomY - wallThickness / 2;
          doc.line(roomX + winPos, y, roomX + winPos + winW, y);
          doc.setLineWidth(0.3);
          doc.line(roomX + winPos, y - 1, roomX + winPos + winW, y - 1);
          doc.line(roomX + winPos, y + 1, roomX + winPos + winW, y + 1);
        } else if (win.wallIndex === 2) {
          const y = roomY + roomDrawH + wallThickness / 2;
          doc.line(roomX + winPos, y, roomX + winPos + winW, y);
          doc.setLineWidth(0.3);
          doc.line(roomX + winPos, y - 1, roomX + winPos + winW, y - 1);
          doc.line(roomX + winPos, y + 1, roomX + winPos + winW, y + 1);
        } else if (win.wallIndex === 3) {
          const x = roomX - wallThickness / 2;
          doc.line(x, roomY + winPos, x, roomY + winPos + winW);
          doc.setLineWidth(0.3);
          doc.line(x - 1, roomY + winPos, x - 1, roomY + winPos + winW);
          doc.line(x + 1, roomY + winPos, x + 1, roomY + winPos + winW);
        } else if (win.wallIndex === 1) {
          const x = roomX + roomDrawW + wallThickness / 2;
          doc.line(x, roomY + winPos, x, roomY + winPos + winW);
          doc.setLineWidth(0.3);
          doc.line(x - 1, roomY + winPos, x - 1, roomY + winPos + winW);
          doc.line(x + 1, roomY + winPos, x + 1, roomY + winPos + winW);
        }
      });

      doc.setDrawColor(0);
      doc.setLineWidth(0.15);
      const dimOffset = 8;

      drawDimension(doc, roomX, roomY - dimOffset - wallThickness, roomX + roomDrawW, roomY - dimOffset - wallThickness, `${roomL} cm`);
      drawDimension(doc, roomX + roomDrawW + dimOffset + wallThickness, roomY, roomX + roomDrawW + dimOffset + wallThickness, roomY + roomDrawH, `${roomW} cm`);

      const colors: [number, number, number][] = [
        [41, 128, 185], [39, 174, 96], [192, 57, 43],
        [142, 68, 173], [243, 156, 18], [22, 160, 133],
      ];

      const placedPositions: Array<{ x: number; y: number; w: number; h: number }> = [];

      products.forEach((product, idx) => {
        const color = colors[idx % colors.length];
        const pW = ((product.designW || product.width || 60) / 10) * scale;
        const pH = ((product.designD || product.depth || 60) / 10) * scale;

        const wallIdx = product.wallIndex ?? 0;
        let px: number, py: number;

        const positionOffset = product.position != null ? (product.position / 10) * scale : null;

        if (wallIdx === 0) {
          px = roomX + (positionOffset ?? computeAutoPosition(placedPositions, roomX, roomY, pW, pH, "top", roomDrawW));
          py = roomY + 2;
        } else if (wallIdx === 1) {
          px = roomX + roomDrawW - pH - 2;
          py = roomY + (positionOffset ?? computeAutoPosition(placedPositions, roomX + roomDrawW - pH - 2, roomY, pH, pW, "right", roomDrawH));
        } else if (wallIdx === 2) {
          px = roomX + (positionOffset ?? computeAutoPosition(placedPositions, roomX, roomY + roomDrawH - pH - 2, pW, pH, "bottom", roomDrawW));
          py = roomY + roomDrawH - pH - 2;
        } else {
          px = roomX + 2;
          py = roomY + (positionOffset ?? computeAutoPosition(placedPositions, roomX + 2, roomY, pH, pW, "left", roomDrawH));
        }

        px = Math.max(roomX + 1, Math.min(px, roomX + roomDrawW - pW - 1));
        py = Math.max(roomY + 1, Math.min(py, roomY + roomDrawH - pH - 1));

        placedPositions.push({ x: px, y: py, w: pW, h: pH });

        doc.setFillColor(color[0], color[1], color[2]);
        doc.setDrawColor(Math.max(0, color[0] - 30), Math.max(0, color[1] - 30), Math.max(0, color[2] - 30));
        doc.setLineWidth(0.3);
        doc.rect(px, py, pW, pH, "FD");

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        const label = `${idx + 1}`;
        doc.text(label, px + pW / 2, py + pH / 2 + 1, { align: "center" });

        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFontSize(5.5);
        const dimText = `${product.designW || product.width || "?"} x ${product.designH || product.height || "?"} cm`;
        doc.text(dimText, px + pW / 2, py + pH + 3.5, { align: "center" });
      });

      doc.setTextColor(0, 0, 0);

      const legendX = pageW - margin - 50;
      const legendY = drawAreaTop + 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Legend", legendX, legendY);
      doc.setFont("helvetica", "normal");

      products.forEach((product, idx) => {
        const color = colors[idx % colors.length];
        const y = legendY + 6 + idx * 8;
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(legendX, y - 3, 4, 4, "F");
        doc.setFontSize(6.5);
        doc.setTextColor(0, 0, 0);
        const name = product.nameEn || product.description || product.code || `Unit ${idx + 1}`;
        doc.text(`${idx + 1}. ${name.substring(0, 20)}`, legendX + 6, y);
      });

      if (doors.length > 0 || windows.length > 0) {
        let symY = legendY + 6 + products.length * 8 + 5;
        doc.setFontSize(6.5);
        doc.setTextColor(0, 0, 0);
        if (doors.length > 0) {
          doc.setDrawColor(139, 69, 19);
          doc.setLineWidth(0.4);
          doc.line(legendX, symY, legendX + 4, symY);
          doc.text(`Door (x${doors.length})`, legendX + 6, symY + 1);
          symY += 7;
        }
        if (windows.length > 0) {
          doc.setDrawColor(0, 120, 215);
          doc.setLineWidth(0.5);
          doc.line(legendX, symY, legendX + 4, symY);
          doc.setLineWidth(0.2);
          doc.line(legendX, symY - 1, legendX + 4, symY - 1);
          doc.line(legendX, symY + 1, legendX + 4, symY + 1);
          doc.text(`Window (x${windows.length})`, legendX + 6, symY + 1);
        }
      }

      const stampY = pageH - margin - 25;
      const stampX = pageW - margin - 55;
      doc.setDrawColor(26, 54, 93);
      doc.setLineWidth(0.5);
      doc.rect(stampX, stampY, 55, 18);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(26, 54, 93);
      doc.text(displayCompanyName, stampX + 27.5, stampY + 5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`Drawing #${quotationNumber || "---"}`, stampX + 27.5, stampY + 9, { align: "center" });
      doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, stampX + 27.5, stampY + 13, { align: "center" });
      doc.setFontSize(5);
      doc.setTextColor(100, 100, 100);
      doc.text("Approved: _______________", stampX + 27.5, stampY + 16.5, { align: "center" });

      const infoY = pageH - margin - 3;
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`Scale: 1:${Math.round(1 / (scale / 10) * 10)} | Unit: cm | Room Height: ${roomH} cm`, margin, infoY);
      doc.text("Page 1/2", pageW - margin, infoY, { align: "right" });

      doc.addPage("a4", "landscape");

      doc.setFillColor(26, 54, 93);
      doc.rect(margin, margin, drawW, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text("Product Schedule", pageW / 2, margin + 9, { align: "center" });

      doc.setTextColor(0, 0, 0);

      const tableData = products.map((p, idx) => [
        String(idx + 1),
        p.nameEn || p.description || p.code || `Product ${idx + 1}`,
        p.code || "-",
        `${p.designW || p.width || "-"} x ${p.designH || p.height || "-"} x ${p.designD || p.depth || "-"}`,
        `${p.manufacturingW || p.designW || p.width || "-"} x ${p.manufacturingH || p.designH || p.height || "-"} x ${p.manufacturingD || p.designD || p.depth || "-"}`,
        String(p.quantity || 1),
        p.price ? parseFloat(String(p.price)).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-",
      ]);

      doc.autoTable({
        startY: margin + 18,
        head: [["#", "Product Name", "Code", "Design Dim. (cm)", "Mfg. Dim. (cm)", "Qty", "Price (SAR)"]],
        body: tableData,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3, halign: "center" },
        headStyles: { fillColor: [26, 54, 93], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 55, halign: "left" },
          2: { cellWidth: 25 },
          3: { cellWidth: 50 },
          4: { cellWidth: 50 },
          5: { cellWidth: 15 },
          6: { cellWidth: 35 },
        },
        margin: { left: margin, right: margin },
      });

      const finalY = doc.lastAutoTable?.finalY || margin + 60;
      const totalPrice = products.reduce((sum, p) => sum + (p.price != null ? parseFloat(String(p.price)) : 0), 0);
      if (totalPrice > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`Total: ${totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} SAR`, pageW - margin, finalY + 8, { align: "right" });
      }

      const stamp2Y = pageH - margin - 25;
      const stamp2X = pageW - margin - 55;
      doc.setDrawColor(26, 54, 93);
      doc.setLineWidth(0.5);
      doc.rect(stamp2X, stamp2Y, 55, 18);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(26, 54, 93);
      doc.text(displayCompanyName, stamp2X + 27.5, stamp2Y + 5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`Drawing #${quotationNumber || "---"}`, stamp2X + 27.5, stamp2Y + 9, { align: "center" });
      doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, stamp2X + 27.5, stamp2Y + 13, { align: "center" });
      doc.setFontSize(5);
      doc.setTextColor(100, 100, 100);
      doc.text("Approved: _______________", stamp2X + 27.5, stamp2Y + 16.5, { align: "center" });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(displayCompanyName, margin, pageH - margin - 4);
      doc.text("Page 2/2", pageW - margin, pageH - margin - 4, { align: "right" });

      doc.save(`Engineering-Drawing-${quotationNumber || "plan"}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={generating}
      className="text-xs"
      data-testid="button-export-engineering-pdf"
    >
      {generating ? (
        <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />
      ) : (
        <FileDown className="w-3.5 h-3.5 me-1.5" />
      )}
      {t("Export Drawing", "Export Drawing")}
    </Button>
  );
}

function drawDimension(doc: JsPDFWithAutoTable, x1: number, y1: number, x2: number, y2: number, label: string) {
  const isHorizontal = Math.abs(y1 - y2) < 1;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);

  if (isHorizontal) {
    const y = y1;
    doc.line(x1, y - 2, x1, y + 2);
    doc.line(x2, y - 2, x2, y + 2);
    doc.line(x1, y, x2, y);
    doc.line(x1, y, x1 + 2, y - 1);
    doc.line(x1, y, x1 + 2, y + 1);
    doc.line(x2, y, x2 - 2, y - 1);
    doc.line(x2, y, x2 - 2, y + 1);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(label, (x1 + x2) / 2, y - 1.5, { align: "center" });
  } else {
    const x = x1;
    doc.line(x - 2, y1, x + 2, y1);
    doc.line(x - 2, y2, x + 2, y2);
    doc.line(x, y1, x, y2);
    doc.line(x, y1, x - 1, y1 + 2);
    doc.line(x, y1, x + 1, y1 + 2);
    doc.line(x, y2, x - 1, y2 - 2);
    doc.line(x, y2, x + 1, y2 - 2);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(label, x + 3, (y1 + y2) / 2);
  }
}

function drawArc(doc: JsPDFWithAutoTable, x: number, y: number, width: number, direction: "up" | "down" | "left" | "right") {
  doc.setDrawColor(139, 69, 19);
  doc.setLineWidth(0.2);
  const steps = 12;
  const radius = width * 0.7;

  for (let i = 0; i < steps; i++) {
    const t1 = i / steps;
    const t2 = (i + 1) / steps;
    let x1: number, y1: number, x2: number, y2: number;

    if (direction === "down") {
      const angle1 = (Math.PI / 2) * t1;
      const angle2 = (Math.PI / 2) * t2;
      x1 = x + Math.sin(angle1) * radius;
      y1 = y + Math.cos(angle1) * radius;
      x2 = x + Math.sin(angle2) * radius;
      y2 = y + Math.cos(angle2) * radius;
    } else if (direction === "up") {
      const angle1 = (Math.PI / 2) * t1;
      const angle2 = (Math.PI / 2) * t2;
      x1 = x + Math.sin(angle1) * radius;
      y1 = y - Math.cos(angle1) * radius;
      x2 = x + Math.sin(angle2) * radius;
      y2 = y - Math.cos(angle2) * radius;
    } else if (direction === "right") {
      const angle1 = (Math.PI / 2) * t1;
      const angle2 = (Math.PI / 2) * t2;
      x1 = x + Math.cos(angle1) * radius;
      y1 = y + Math.sin(angle1) * radius;
      x2 = x + Math.cos(angle2) * radius;
      y2 = y + Math.sin(angle2) * radius;
    } else {
      const angle1 = (Math.PI / 2) * t1;
      const angle2 = (Math.PI / 2) * t2;
      x1 = x - Math.cos(angle1) * radius;
      y1 = y + Math.sin(angle1) * radius;
      x2 = x - Math.cos(angle2) * radius;
      y2 = y + Math.sin(angle2) * radius;
    }

    doc.line(x1, y1, x2, y2);
  }
}

function computeAutoPosition(
  placed: Array<{ x: number; y: number; w: number; h: number }>,
  baseX: number,
  baseY: number,
  itemW: number,
  itemH: number,
  _wall: string,
  maxLength: number
): number {
  let pos = 2;
  const step = 5;

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateX = baseX + pos;
    const candidateY = baseY;
    const overlaps = placed.some((p) => {
      return !(candidateX + itemW < p.x || candidateX > p.x + p.w || candidateY + itemH < p.y || candidateY > p.y + p.h);
    });
    if (!overlaps) return pos;
    pos += step + itemW;
    if (pos + itemW > maxLength) break;
  }

  return Math.min(pos, maxLength - itemW - 2);
}
