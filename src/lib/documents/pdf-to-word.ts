type PdfLine = { text: string; page: number; y: number };
type PdfTextItem = { str: string; transform: number[]; width: number };

async function loadImage(path: string) {
  const response = await fetch(path);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

function normalizeLine(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function linesFromItems(items: PdfTextItem[], page: number): PdfLine[] {
  const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5] ?? 0;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (row) row.items.push(item);
    else rows.push({ y, items: [item] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.items.sort(
        (left, right) => (left.transform[4] ?? 0) - (right.transform[4] ?? 0),
      );
      let text = "";
      let previousEnd = 0;
      for (const item of ordered) {
        const x = item.transform[4] ?? 0;
        if (text && x - previousEnd > 2) text += " ";
        text += item.str;
        previousEnd = x + (item.width || 0);
      }
      return { text: normalizeLine(text), page, y: row.y };
    })
    .filter(({ text }) => {
      if (!text || /^Page\s+\d+\s*\/\s*\d+$/i.test(text)) return false;
      return !/^MARCHÉ N°.*PROGRAMME DE DÉVELOPPEMENT$/i.test(text);
    });
}

export async function convertPdfBlobToEditableWord(pdfBlob: Blob): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const [oncfLogo, alstomLogo, avanzitLogo] = await Promise.all([
    loadImage("/oncf-logo.png"),
    loadImage("/alstom-logo.png"),
    loadImage("/avanzit-logo.png"),
  ]);
  const {
    AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer,
    PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import("docx");
  const pdf = await pdfjs.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
  const lines: PdfLine[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is typeof item & PdfTextItem => "str" in item,
      );
      lines.push(...linesFromItems(items, pageNumber));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  if (!lines.length) throw new Error("Ce PDF ne contient pas de texte numérique modifiable.");

  const noBorders = {
    top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
  };
  const logoCell = (bytes: Uint8Array | null, label: string) =>
    new TableCell({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: bytes
          ? [new ImageRun({ data: bytes, type: "png", transformation: { width: 105, height: 36 } })]
          : [new TextRun({ text: label, bold: true, color: "0050A4", size: 20 })],
      })],
    });
  const children = lines.map((line, index) => {
    const isMainTitle = /^PROCÈS[- ]VERBAL$/i.test(line.text);
    const isSection = /^\d+\.\s+/.test(line.text);
    const isCompany = /^(ONCF|ALSTOM|AVANZIT)$/i.test(line.text);
    const isLabelLine = /^(Date|Projet|Classement|Entreprise|Zone|Lieu|Horaire)\b/i.test(line.text);
    return new Paragraph({
      pageBreakBefore: index > 0 && line.page !== lines[index - 1].page,
      alignment: isMainTitle || isCompany ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      spacing: {
        before: isSection ? 360 : isMainTitle ? 180 : 0,
        after: isSection ? 160 : isMainTitle ? 220 : 100,
        line: 300,
      },
      border: isSection
        ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: "E2001A" } }
        : undefined,
      children: [new TextRun({
        text: line.text,
        bold: isMainTitle || isSection || isCompany || isLabelLine,
        size: isMainTitle ? 34 : isSection ? 23 : 20,
        color: isMainTitle ? "16233B" : isSection ? "0050A4" : "283446",
      })],
    });
  });

  const wordDocument = new Document({
    sections: [{
      properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 850 } } },
      headers: { default: new Header({ children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders,
          rows: [new TableRow({ children: [
            logoCell(alstomLogo, "ALSTOM"), logoCell(oncfLogo, "ONCF"),
            logoCell(avanzitLogo, "AVANZIT"),
          ] })],
        }),
        new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2001A" } } }),
      ] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", size: 16, color: "64748B" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
        ],
      })] }) },
      children,
    }],
  });
  return Packer.toBlob(wordDocument);
}
