"use client";

export type ExportTask = {
  title: string;
  alstom: string;
  avanzit: string;
  status: string;
  currentProgress: number;
  periodIncrease: number;
  activityContribution: number;
  periodContribution: number;
  workSummary: string;
};

export type ExportActivity = {
  zone: string;
  code: string;
  name: string;
  location: string;
  alstom: string;
  avanzit: string;
  progress: number;
  tasks: ExportTask[];
};

export type ExportPhoto = {
  url: string;
  activity: string;
  task: string;
  date: string;
  caption: string;
};

export type ReportExportData = {
  reportTitle: string;
  periodTitle: string;
  periodRange: string;
  scopeTitle: string;
  metrics: {
    completed: number;
    inProgress: number;
    blocked: number;
    averageProgress: number;
    periodIncrease: number;
    updates: number;
  };
  activities: ExportActivity[];
  completedWork: string[];
  ongoingWork: string[];
  blockers: string[];
  nextSteps: string[];
  photos: ExportPhoto[];
};

function slugDate() {
  return new Date().toISOString().slice(0, 10);
}

const PDF_COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "column-rule-color",
  "-webkit-text-stroke-color",
  "fill",
  "stroke",
] as const;

const MODERN_COLOR_FUNCTION =
  /\b(?:lab|lch|oklab|oklch|color|color-mix)\s*\(/i;

function rasterizeColor(
  value: string,
  context: CanvasRenderingContext2D,
) {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = "#000000";
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

/**
 * html2canvas 1.x cannot parse the modern Lab/Oklab colors emitted by
 * Tailwind 4. Normalize only the cloned report so the live UI keeps its exact
 * styling while the PDF renderer receives universally supported RGB values.
 */
function normalizePdfCloneColors(
  root: HTMLElement,
  includeDescendants = true,
) {
  const canvas = root.ownerDocument.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const view = root.ownerDocument.defaultView;
  if (!context || !view) return;

  const elements: Element[] = includeDescendants
    ? [root, ...Array.from(root.querySelectorAll("*"))]
    : [root];
  for (const element of elements) {
    if (!(element instanceof view.HTMLElement) && !(element instanceof view.SVGElement)) {
      continue;
    }
    const computed = view.getComputedStyle(element);
    for (const property of PDF_COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property).trim();
      if (value && MODERN_COLOR_FUNCTION.test(value)) {
        element.style.setProperty(property, rasterizeColor(value, context), "important");
      }
    }

    for (const property of ["box-shadow", "text-shadow", "background-image"]) {
      const value = computed.getPropertyValue(property);
      if (MODERN_COLOR_FUNCTION.test(value)) {
        element.style.setProperty(property, "none", "important");
      }
    }
  }
}

export async function downloadReportPdf(
  element: HTMLElement,
  fileName = `rapport-pdd-${slugDate()}.pdf`,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone: (clonedDocument, clonedElement) => {
      normalizePdfCloneColors(clonedDocument.documentElement, false);
      normalizePdfCloneColors(clonedDocument.body, false);
      normalizePdfCloneColors(clonedElement);
    },
  });

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 7;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const pageHeightPx = Math.floor(
    (printableHeight * canvas.width) / printableWidth,
  );

  let sourceY = 0;
  let pageIndex = 0;
  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Impossible de préparer la page PDF.");
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );
    if (pageIndex > 0) pdf.addPage();
    const renderedHeight = (sliceHeight * printableWidth) / canvas.width;
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      margin,
      margin,
      printableWidth,
      renderedHeight,
      undefined,
      "FAST",
    );
    sourceY += sliceHeight;
    pageIndex += 1;
  }
  pdf.save(fileName);
}

async function loadImage(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Image indisponible : ${path}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  if (blob.type.includes("webp")) {
    const canvas = window.document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossible de convertir la photo WebP.");
    context.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Conversion WebP impossible.")),
        "image/png",
      ),
    );
    return {
      bytes: new Uint8Array(await pngBlob.arrayBuffer()),
      type: "png" as const,
      width: bitmap.width,
      height: bitmap.height,
    };
  }
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    type: blob.type.includes("jpeg") ? ("jpg" as const) : ("png" as const),
    width: bitmap.width,
    height: bitmap.height,
  };
}

function fitImage(
  width: number,
  height: number,
  maximumWidth: number,
  maximumHeight: number,
) {
  const ratio = Math.min(maximumWidth / width, maximumHeight / height);
  return { width: width * ratio, height: height * ratio };
}

export async function downloadReportWord(
  data: ReportExportData,
  fileName = `rapport-pdd-${slugDate()}.docx`,
) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    Packer,
    PageOrientation,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const red = "ED1B2F";
  const navy = "0F2747";
  const paleBlue = "EAF2FA";
  const border = { style: BorderStyle.SINGLE, size: 1, color: "D8E1EA" };
  const allBorders = {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border,
  };
  const alstomLogo = await loadImage("/alstom-logo.png");
  const alstomLogoSize = fitImage(
    alstomLogo.width,
    alstomLogo.height,
    105,
    38,
  );
  const whiteCell = (children: InstanceType<typeof Paragraph>[]) =>
    new TableCell({
      children,
      shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
    });
  const headerCell = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text, bold: true, color: "FFFFFF", size: 18 }),
          ],
        }),
      ],
      shading: { fill: red, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 100, right: 100 },
    });
  const textCell = (text: string, bold = false) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text: text || "-", bold, size: 17 })],
        }),
      ],
      margins: { top: 85, bottom: 85, left: 100, right: 100 },
    });
  const sectionTitle = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: red } },
      children: [new TextRun({ text, bold: true, color: navy, size: 26 })],
    });
  const bulletParagraphs = (values: string[]) =>
    (values.length ? values : ["Aucune information saisie."]).map(
      (value) =>
        new Paragraph({
          numbering: { reference: "report-bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text: value, size: 19 })],
        }),
    );

  const children: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [1800, 5000, 1800],
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
            whiteCell([
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: alstomLogo.bytes,
                    type: alstomLogo.type,
                    transformation: alstomLogoSize,
                  }),
                ],
              }),
            ]),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "MARCHÉ N° 625C07 PDD",
                      bold: true,
                      color: "FFFFFF",
                      size: 22,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "PROGRAMME DE DÉVELOPPEMENT",
                      bold: true,
                      color: "FFFFFF",
                      size: 25,
                    }),
                  ],
                }),
              ],
              shading: { fill: red, type: ShadingType.CLEAR },
              margins: { top: 160, bottom: 160, left: 100, right: 100 },
            }),
            whiteCell([
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "AVANZIT",
                    bold: true,
                    color: navy,
                    size: 30,
                  }),
                ],
              }),
            ]),
          ],
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 260, after: 80 },
      children: [
        new TextRun({
          text: data.reportTitle.toUpperCase(),
          bold: true,
          color: navy,
          size: 34,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: data.periodTitle,
          bold: true,
          color: "0050A4",
          size: 23,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: data.periodRange, color: "64748B", size: 17 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: data.scopeTitle,
          bold: true,
          color: red,
          size: 18,
        }),
      ],
    }),
    sectionTitle("1. SYNTHÈSE EXÉCUTIVE"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allBorders,
      rows: [
        new TableRow({
          children: [
            headerCell("Terminées"),
            headerCell("En cours"),
            headerCell("Bloquées"),
            headerCell("Avancement moyen"),
            headerCell("Gain période"),
            headerCell("Mises à jour"),
          ],
        }),
        new TableRow({
          children: [
            textCell(String(data.metrics.completed), true),
            textCell(String(data.metrics.inProgress), true),
            textCell(String(data.metrics.blocked), true),
            textCell(`${data.metrics.averageProgress}%`, true),
            textCell(`+${data.metrics.periodIncrease} pts`, true),
            textCell(String(data.metrics.updates), true),
          ],
        }),
      ],
    }),
    sectionTitle("2. DÉTAIL DES ACTIVITÉS ET TÂCHES"),
  ];

  let currentWordZone = "";
  for (const activity of data.activities) {
    if (activity.zone !== currentWordZone) {
      currentWordZone = activity.zone;
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 100 },
          shading: { fill: red, type: ShadingType.CLEAR },
          children: [
            new TextRun({
              text: `ZONE : ${currentWordZone.toUpperCase()}`,
              bold: true,
              color: "FFFFFF",
              size: 21,
            }),
          ],
        }),
      );
    }
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 70 },
        shading: { fill: paleBlue, type: ShadingType.CLEAR },
        children: [
          new TextRun({
            text: `${activity.code} - ${activity.name} (${activity.progress}%)`,
            bold: true,
            color: navy,
            size: 22,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 90 },
        children: [
          new TextRun({
            text: `${activity.zone} | ${activity.location} | Alstom: ${activity.alstom} | Avanzit: ${activity.avanzit}`,
            color: "475569",
            size: 17,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allBorders,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("Tâche"),
              headerCell("Responsables"),
              headerCell("État"),
              headerCell("Progression"),
              headerCell("Contribution activité"),
              headerCell("Travaux période"),
            ],
          }),
          ...activity.tasks.map(
            (task) =>
              new TableRow({
                children: [
                  textCell(task.title, true),
                  textCell(`A: ${task.alstom}\nV: ${task.avanzit}`),
                  textCell(task.status),
                  textCell(
                    `${task.currentProgress}% | +${task.periodIncrease} pts`,
                  ),
                  textCell(
                    `${task.activityContribution.toFixed(1)} pts | +${task.periodContribution.toFixed(1)} pts`,
                  ),
                  textCell(task.workSummary),
                ],
              }),
          ),
        ],
      }),
    );
  }

  children.push(
    sectionTitle("3. TRAVAUX RÉALISÉS"),
    ...bulletParagraphs(data.completedWork),
    sectionTitle("4. TRAVAUX EN COURS"),
    ...bulletParagraphs(data.ongoingWork),
    sectionTitle("5. BLOCAGES, RISQUES ET ALERTES"),
    ...bulletParagraphs(data.blockers),
    sectionTitle("6. PROCHAINES ÉTAPES"),
    ...bulletParagraphs(data.nextSteps),
  );

  children.push(sectionTitle("7. PLANCHES PHOTOGRAPHIQUES"));
  if (data.photos.length) {
    for (let index = 0; index < data.photos.length; index += 2) {
      const photoCells = await Promise.all(
        data.photos.slice(index, index + 2).map(async (photo, offset) => {
          const image = await loadImage(photo.url);
          const photoSize = fitImage(image.width, image.height, 300, 205);
          return new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: image.bytes,
                    type: image.type,
                    transformation: photoSize,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { before: 80 },
                children: [
                  new TextRun({
                    text: `Photo ${index + offset + 1} - ${photo.activity}`,
                    bold: true,
                    color: navy,
                    size: 17,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${photo.task} | ${photo.date}`,
                    color: "64748B",
                    size: 16,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: photo.caption || "-", size: 16 }),
                ],
              }),
            ],
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
          });
        }),
      );
      while (photoCells.length < 2) photoCells.push(textCell(""));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: allBorders,
          rows: [new TableRow({ children: photoCells })],
        }),
        new Paragraph({ spacing: { after: 120 } }),
      );
    }
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Aucune photo d’avancement enregistrée pour cette période.",
            color: "64748B",
            italics: true,
            size: 18,
          }),
        ],
      }),
    );
  }

  children.push(
    sectionTitle("8. VISA ET VALIDATION"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allBorders,
      rows: [
        new TableRow({
          children: [headerCell("ALSTOM"), headerCell("AVANZIT")],
        }),
        new TableRow({
          height: { value: 1000, rule: "atLeast" },
          children: [
            textCell("Nom, date et signature"),
            textCell("Nom, date et signature"),
          ],
        }),
      ],
    }),
  );

  const wordDocument = new Document({
    numbering: {
      config: [
        {
          reference: "report-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 180 } },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 19, color: "1F2937" },
          paragraph: { spacing: { after: 80, line: 260 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
              width: 16838,
              height: 11906,
            },
            margin: { top: 600, right: 600, bottom: 600, left: 600 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDocument);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
