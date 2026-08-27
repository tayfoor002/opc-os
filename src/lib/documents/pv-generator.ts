import type { PastedPvDocument } from "@/lib/meetings/pasted-pv";

export type GeneratedPv = PastedPvDocument & {
  reference: string;
  zone_name: string;
  classification: string;
};

function sectionLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function safePvFileName(title: string) {
  return (
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "proces-verbal"
  );
}

export function downloadGeneratedFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generatePvPdfBlob(pv: GeneratedPv) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = width - margin * 2;
  let y = 18;

  pdf.setFillColor(0, 80, 164);
  pdf.rect(0, 0, width, 13, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("OPC OS · PROJET PDD", margin, 8.5);
  pdf.text("DOCUMENT OFFICIEL", width - margin, 8.5, { align: "right" });

  pdf.setTextColor(22, 35, 59);
  pdf.setFontSize(19);
  pdf.text("PROCÈS-VERBAL", width / 2, y + 7, { align: "center" });
  y += 14;
  pdf.setFontSize(13);
  pdf.setTextColor(0, 80, 164);
  const titleLines = pdf.splitTextToSize(pv.title.toUpperCase(), contentWidth * 0.9) as string[];
  pdf.text(titleLines, width / 2, y, { align: "center" });
  y += titleLines.length * 5.5 + 5;

  autoTable(pdf, {
    startY: y,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, textColor: [22, 35, 59] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [239, 246, 255], cellWidth: 28 },
      2: { fontStyle: "bold", fillColor: [239, 246, 255], cellWidth: 28 },
    },
    body: [
      ["Référence", pv.reference, "Date", pv.meeting_date || "—"],
      ["Zone", pv.zone_name || "Non classée", "Classement", pv.classification],
      ["Lieu", pv.location || "—", "Horaire", [pv.start_time, pv.end_time].filter(Boolean).join(" — ") || "—"],
    ],
  });
  y = ((pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 9;

  const addPageIfNeeded = (needed = 18) => {
    if (y + needed <= height - 18) return;
    pdf.addPage();
    y = 20;
  };
  const heading = (label: string) => {
    addPageIfNeeded(15);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 80, 164);
    pdf.text(label, margin, y);
    y += 6;
  };
  const paragraph = (text: string) => {
    if (!text.trim()) return;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.3);
    pdf.setTextColor(40, 52, 70);
    const lines = pdf.splitTextToSize(text, contentWidth) as string[];
    for (const line of lines) {
      addPageIfNeeded(6);
      pdf.text(line, margin, y);
      y += 4.8;
    }
    y += 2;
  };

  heading("Objet du procès-verbal");
  paragraph(pv.objective || "Procès-verbal de réunion.");
  heading("Contenu du procès-verbal");
  for (const block of sectionLines(pv.introduction)) paragraph(block);

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(210, 220, 232);
    pdf.line(margin, height - 13, width - margin, height - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${pv.reference} · Page ${page}/${pageCount}`, width / 2, height - 8, { align: "center" });
  }
  return pdf.output("blob");
}

export async function generatePvWordBlob(pv: GeneratedPv) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    Packer,
    PageNumber,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D9E2EC" },
  };
  const cell = (label: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: label || "—", bold, size: 18 })] })],
      shading: bold ? { fill: "EFF6FF" } : undefined,
    });
  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text, bold: true, size: 24, color: "0050A4" })],
    });
  const bodyParagraphs = sectionLines(pv.introduction).map(
    (text) =>
      new Paragraph({
        spacing: { after: 140, line: 310 },
        children: [new TextRun({ text, size: 20, color: "283446" })],
      }),
  );
  const document = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 850 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "OPC OS · PROJET PDD · DOCUMENT OFFICIEL", bold: true, size: 17, color: "0050A4" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${pv.reference} · Page `, size: 16, color: "64748B" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [new TextRun({ text: "PROCÈS-VERBAL", bold: true, size: 36, color: "16233B" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: pv.title.toUpperCase(), bold: true, size: 25, color: "0050A4" })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({ children: [cell("Référence", true), cell(pv.reference), cell("Date", true), cell(pv.meeting_date)] }),
              new TableRow({ children: [cell("Zone", true), cell(pv.zone_name), cell("Classement", true), cell(pv.classification)] }),
              new TableRow({ children: [cell("Lieu", true), cell(pv.location), cell("Horaire", true), cell([pv.start_time, pv.end_time].filter(Boolean).join(" — "))] }),
            ],
          }),
          heading("1. Objet du procès-verbal"),
          new Paragraph({ children: [new TextRun({ text: pv.objective || "Procès-verbal de réunion.", size: 20 })] }),
          heading("2. Contenu du procès-verbal"),
          ...bodyParagraphs,
        ],
      },
    ],
  });
  return Packer.toBlob(document);
}
