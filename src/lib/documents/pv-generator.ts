import type { PastedPvDocument } from "@/lib/meetings/pasted-pv";

export type GeneratedPv = PastedPvDocument & {
  reference: string;
  zone_name: string;
  classification: string;
  project_name: string;
  issuer_company: string;
  show_logos: { oncf: boolean; alstom: boolean; avanzit: boolean };
  signatories: Array<{
    company: "ONCF" | "ALSTOM" | "AVANZIT";
    name: string;
    role: string;
  }>;
};

type LogoImage = { bytes: Uint8Array; width: number; height: number };

async function loadLogo(path: string): Promise<LogoImage> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Logo indisponible : ${path}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversion du logo impossible.");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const background = [pixels.data[0], pixels.data[1], pixels.data[2], pixels.data[3]];
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = pixels.data[offset + 3];
        const colorDistance =
          Math.abs(pixels.data[offset] - background[0]) +
          Math.abs(pixels.data[offset + 1] - background[1]) +
          Math.abs(pixels.data[offset + 2] - background[2]);
        const visible = background[3] < 20 ? alpha > 30 : alpha > 30 && colorDistance > 42;
        if (!visible) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    const hasBounds = right >= left && bottom >= top;
    const padding = hasBounds
      ? Math.max(2, Math.round(Math.max(right - left, bottom - top) * 0.015))
      : 0;
    const sourceX = hasBounds ? Math.max(0, left - padding) : 0;
    const sourceY = hasBounds ? Math.max(0, top - padding) : 0;
    const sourceWidth = hasBounds
      ? Math.min(canvas.width - sourceX, right - left + 1 + padding * 2)
      : canvas.width;
    const sourceHeight = hasBounds
      ? Math.min(canvas.height - sourceY, bottom - top + 1 + padding * 2)
      : canvas.height;
    const cropped = document.createElement("canvas");
    cropped.width = sourceWidth;
    cropped.height = sourceHeight;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) throw new Error("Recadrage du logo impossible.");
    croppedContext.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    const png = await new Promise<Blob>((resolve, reject) =>
      cropped.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Conversion du logo impossible.")),
        "image/png",
      ),
    );
    return {
      bytes: new Uint8Array(await png.arrayBuffer()),
      width: sourceWidth,
      height: sourceHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitLogo(logo: LogoImage, maximumWidth: number, maximumHeight: number) {
  const ratio = Math.min(maximumWidth / logo.width, maximumHeight / logo.height);
  return { width: logo.width * ratio, height: logo.height * ratio };
}

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

export async function prepareOriginalPvScan(file: File) {
  if (file.type === "application/pdf") return file as Blob;
  if (!file.type.startsWith("image/")) {
    throw new Error("Le scan original doit être un PDF, JPG ou PNG.");
  }
  const { jsPDF } = await import("jspdf");
  const bitmap = await createImageBitmap(file);
  try {
    const landscape = bitmap.width > bitmap.height;
    const pdf = new jsPDF({
      orientation: landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const ratio = Math.min(
      (pageWidth - margin * 2) / bitmap.width,
      (pageHeight - margin * 2) / bitmap.height,
    );
    const imageWidth = bitmap.width * ratio;
    const imageHeight = bitmap.height * ratio;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversion du scan original impossible.");
    context.drawImage(bitmap, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
    pdf.addImage(
      dataUrl,
      "JPEG",
      (pageWidth - imageWidth) / 2,
      (pageHeight - imageHeight) / 2,
      imageWidth,
      imageHeight,
      undefined,
      "FAST",
    );
    return pdf.output("blob");
  } finally {
    bitmap.close();
  }
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
  const navy: [number, number, number] = [11, 39, 72];
  const blue: [number, number, number] = [0, 80, 164];
  const red: [number, number, number] = [226, 0, 26];
  const border: [number, number, number] = [210, 220, 232];
  const slate: [number, number, number] = [71, 85, 105];
  const [oncfLogo, alstomLogo, avanzitLogo] = await Promise.all([
    pv.show_logos.oncf ? loadLogo("/oncf-logo.png").catch(() => null) : null,
    pv.show_logos.alstom ? loadLogo("/alstom-logo.png").catch(() => null) : null,
    pv.show_logos.avanzit ? loadLogo("/avanzit-logo.png").catch(() => null) : null,
  ]);
  let y = 31;

  const placeLogo = (
    logo: LogoImage | null,
    centerX: number,
    maximumWidth: number,
    maximumHeight: number,
  ) => {
    if (!logo) return;
    const dimensions = fitLogo(logo, maximumWidth, maximumHeight);
    pdf.addImage(
      logo.bytes,
      "PNG",
      centerX - dimensions.width / 2,
      7 + (13 - dimensions.height) / 2,
      dimensions.width,
      dimensions.height,
    );
  };
  const renderHeader = () => {
    pdf.setFillColor(...red);
    pdf.rect(0, 0, width, 3, "F");
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 3, width, 21, "F");
    placeLogo(alstomLogo, margin + 22, 38, 12);
    placeLogo(oncfLogo, width / 2, 29, 13);
    placeLogo(avanzitLogo, width - margin - 22, 38, 12);
    pdf.setDrawColor(...border);
    pdf.line(margin, 24, width - margin, 24);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...slate);
    pdf.text("MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", width / 2, 28, { align: "center" });
    y = 36;
  };
  renderHeader();

  pdf.setTextColor(...navy);
  pdf.setFontSize(19);
  pdf.text("PROCÈS-VERBAL", width / 2, y, { align: "center" });
  y += 9;
  pdf.setFontSize(13);
  pdf.setTextColor(...blue);
  const titleLines = pdf.splitTextToSize(pv.title.toUpperCase(), contentWidth * 0.9) as string[];
  pdf.text(titleLines, width / 2, y, { align: "center" });
  y += titleLines.length * 5.5 + 9;

  autoTable(pdf, {
    startY: y,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.8, textColor: navy, lineColor: border },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [239, 246, 255], cellWidth: 28 },
      2: { fontStyle: "bold", fillColor: [239, 246, 255], cellWidth: 28 },
    },
    body: [
      ["Date", pv.meeting_date || "", "Classement", pv.classification],
      ["Chantier", pv.project_name, "Entreprise", pv.issuer_company],
      ["Zone", pv.zone_name || "", "Lieu", pv.location || ""],
      ...([pv.start_time, pv.end_time].some(Boolean)
        ? [["Horaire", [pv.start_time, pv.end_time].filter(Boolean).join(" — "), "", ""]]
        : []),
    ],
  });
  y = ((pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 14;

  const addPageIfNeeded = (needed = 18) => {
    if (y + needed <= height - 18) return;
    pdf.addPage();
    renderHeader();
  };
  const heading = (label: string) => {
    addPageIfNeeded(15);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...blue);
    pdf.text(label, margin, y);
    pdf.setDrawColor(...red);
    pdf.setLineWidth(0.7);
    pdf.line(margin, y + 2, margin + 34, y + 2);
    y += 8;
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
    y += 4;
  };

  heading("1. OBJET DU PROCÈS-VERBAL");
  paragraph(pv.objective || "Procès-verbal de réunion.");
  y += 5;
  heading("2. CONTENU DU PROCÈS-VERBAL");
  for (const block of sectionLines(pv.introduction)) paragraph(block);

  y += 7;
  addPageIfNeeded(74);
  heading("3. VISA ET SIGNATURES");
  const signatureGap = 4;
  const signatureWidth = (contentWidth - signatureGap * 2) / 3;
  for (const [index, signatory] of pv.signatories.entries()) {
    const x = margin + index * (signatureWidth + signatureGap);
    pdf.setDrawColor(...border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, y, signatureWidth, 60, 2, 2, "S");
    pdf.setFillColor(...navy);
    pdf.roundedRect(x, y, signatureWidth, 9, 2, 2, "F");
    pdf.rect(x, y + 5, signatureWidth, 4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(signatory.company, x + signatureWidth / 2, y + 6, { align: "center" });
    pdf.setFontSize(7.5);
    pdf.setTextColor(...slate);
    pdf.text(`Nom et prénom : ${signatory.name || ""}`, x + 3, y + 15);
    pdf.text(`Fonction : ${signatory.role || ""}`, x + 3, y + 21);
    pdf.text("Date :", x + 3, y + 27);
    pdf.setTextColor(148, 163, 184);
    pdf.text("SIGNATURE", x + signatureWidth / 2, y + 51, { align: "center" });
  }
  y += 65;

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...border);
    pdf.line(margin, height - 13, width - margin, height - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...slate);
    pdf.text(`Page ${page}/${pageCount}`, width / 2, height - 8, { align: "center" });
  }
  return pdf.output("blob");
}

export async function generatePvWordBlob(pv: GeneratedPv) {
  const [oncfLogo, alstomLogo, avanzitLogo] = await Promise.all([
    pv.show_logos.oncf ? loadLogo("/oncf-logo.png").catch(() => null) : null,
    pv.show_logos.alstom ? loadLogo("/alstom-logo.png").catch(() => null) : null,
    pv.show_logos.avanzit ? loadLogo("/avanzit-logo.png").catch(() => null) : null,
  ]);
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    ImageRun,
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
      children: [new Paragraph({ children: [new TextRun({ text: label, bold, size: 18 })] })],
      shading: bold ? { fill: "EFF6FF" } : undefined,
    });
  const logoCell = (logo: LogoImage | null, fallback: string) => {
    const maximumWidth = 105;
    const maximumHeight = 36;
    const dimensions = logo
      ? fitLogo(logo, maximumWidth, maximumHeight)
      : { width: maximumWidth, height: maximumHeight };
    return new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: logo
            ? [
                new ImageRun({
                  data: logo.bytes,
                  type: "png",
                  transformation: dimensions,
                }),
              ]
            : [new TextRun({ text: fallback, bold: true, size: 20, color: "0050A4" })],
        }),
      ],
    });
  };
  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 420, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "E2001A" } },
      children: [new TextRun({ text, bold: true, size: 23, color: "0050A4" })],
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
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideHorizontal: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                  new TableRow({
                    children: [
                      logoCell(alstomLogo, pv.show_logos.alstom ? "ALSTOM" : ""),
                      logoCell(oncfLogo, pv.show_logos.oncf ? "ONCF" : ""),
                      logoCell(avanzitLogo, pv.show_logos.avanzit ? "AVANZIT" : ""),
                    ],
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2001A" } },
                children: [new TextRun({ text: "MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", bold: true, size: 15, color: "64748B" })],
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
                  new TextRun({ text: "Page ", size: 16, color: "64748B" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 220, after: 180 },
            children: [new TextRun({ text: "PROCÈS-VERBAL", bold: true, size: 36, color: "16233B" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 420 },
            children: [new TextRun({ text: pv.title.toUpperCase(), bold: true, size: 25, color: "0050A4" })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({ children: [cell("Date", true), cell(pv.meeting_date), cell("Classement", true), cell(pv.classification)] }),
              new TableRow({ children: [cell("Chantier", true), cell(pv.project_name), cell("Entreprise", true), cell(pv.issuer_company)] }),
              new TableRow({ children: [cell("Zone", true), cell(pv.zone_name), cell("Lieu", true), cell(pv.location)] }),
              ...([pv.start_time, pv.end_time].some(Boolean)
                ? [new TableRow({ children: [cell("Horaire", true), cell([pv.start_time, pv.end_time].filter(Boolean).join(" — ")), cell("", true), cell("")] })]
                : []),
            ],
          }),
          heading("1. OBJET DU PROCÈS-VERBAL"),
          new Paragraph({ spacing: { after: 260, line: 320 }, children: [new TextRun({ text: pv.objective || "Procès-verbal de réunion.", size: 20 })] }),
          heading("2. CONTENU DU PROCÈS-VERBAL"),
          ...bodyParagraphs,
          heading("3. VISA ET SIGNATURES"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({
                children: pv.signatories.map(
                  (signatory) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { before: 100, after: 180 },
                          children: [new TextRun({ text: signatory.company, bold: true, size: 23, color: "0050A4" })],
                        }),
                        new Paragraph({ children: [new TextRun({ text: `Nom et prénom : ${signatory.name}`, size: 17, color: "475569" })] }),
                        new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: `Fonction : ${signatory.role}`, size: 17, color: "475569" })] }),
                        new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Date :", size: 17, color: "475569" })] }),
                        new Paragraph({ spacing: { before: 820, after: 160 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SIGNATURE", bold: true, size: 16, color: "94A3B8" })] }),
                      ],
                    }),
                ),
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBlob(document);
}
