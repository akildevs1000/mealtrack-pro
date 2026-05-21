// Server-side PDF and XLSX builders used by the scheduler. The PDF layout is
// intentionally minimal — a title row, a subtitle row, then a fixed-grid table
// rendered with PDFKit. It does not try to match the styled /reports preview;
// FTP delivery just needs a legible operational document.

import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

export type ReportData = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
};

export function buildXlsxBuffer(d: ReportData): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [d.title],
    [d.subtitle],
    [],
    d.columns,
    ...d.rows,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildPdfBuffer(d: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#111").text(`MyMeal — ${d.title}`);
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#666").text(d.subtitle);
    doc.moveDown(0.6);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cols = d.columns.length;
    const colWidth = pageWidth / cols;
    const rowHeight = 18;

    function drawRow(values: (string | number)[], y: number, opts: { header?: boolean }) {
      if (opts.header) {
        doc.rect(doc.page.margins.left, y - 2, pageWidth, rowHeight).fill("#2563eb");
        doc.fillColor("#ffffff").fontSize(9);
      } else {
        doc.fillColor("#222").fontSize(9);
      }
      values.forEach((v, i) => {
        const x = doc.page.margins.left + i * colWidth + 4;
        const text = String(v ?? "");
        doc.text(text, x, y + 3, {
          width: colWidth - 8,
          height: rowHeight - 4,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc.fillColor("#222");
    }

    let y = doc.y;
    drawRow(d.columns, y, { header: true });
    y += rowHeight;

    for (const row of d.rows) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(d.columns, y, { header: true });
        y += rowHeight;
      }
      drawRow(row, y, {});
      y += rowHeight;
    }

    doc.end();
  });
}
