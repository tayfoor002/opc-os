"use client";

export type ExportTask = {
  title: string;
  alstom: string;
  avanzit: string;
  status: string;
  baselineProgress: number;
  currentProgress: number;
  periodIncrease: number;
  measurement: string;
  buildingSteps: Array<{
    label: string;
    progress: number;
  }>;
  activityContribution: number;
  periodContribution: number;
  workSummary: string;
  prerequisiteStatus: string;
  prerequisiteDetails: string;
};

export type ExportActivity = {
  zone: string;
  code: string;
  name: string;
  location: string;
  alstom: string;
  avanzit: string;
  baselineProgress: number;
  progress: number;
  periodIncrease: number;
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
  showOncfLogo: boolean;
  reportTitle: string;
  periodTitle: string;
  periodRange: string;
  scopeTitle: string;
  locationTitle: string;
  metrics: {
    completed: number;
    inProgress: number;
    blocked: number;
    notStarted: number;
    averageProgress: number;
    periodIncrease: number;
    updates: number;
    globalProgress: number;
    globalBaseline: number;
    globalGain: number;
    globalSource: string;
    globalGainStatus: string;
  };
  activities: ExportActivity[];
  completedWork: string[];
  ongoingWork: string[];
  blockers: string[];
  nextSteps: string[];
  photos: ExportPhoto[];
  resources: {
    tools: string[];
    machines: string[];
    equipment: string[];
  };
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
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const tableContainers = Array.from(
    element.querySelectorAll<HTMLElement>("[data-pdf-table-scroll]"),
  );
  const wideTables = Array.from(
    element.querySelectorAll<HTMLElement>("[data-pdf-wide-table]"),
  );
  const maximumColumns = Math.max(
    0,
    ...tableContainers.map((container) =>
      Number(container.dataset.pdfTableColumns || 0),
    ),
  );
  const originalStyles = [element, ...tableContainers, ...wideTables].map(
    (target) => ({ target, cssText: target.style.cssText }),
  );
  const tableWidths = wideTables.map((table) =>
    Math.max(table.scrollWidth, Math.ceil(table.getBoundingClientRect().width)),
  );

  let canvas: HTMLCanvasElement;
  try {
    wideTables.forEach((table, index) => {
      table.style.width = `${tableWidths[index]}px`;
      table.style.maxWidth = "none";
    });
    tableContainers.forEach((container) => {
      container.style.overflow = "visible";
      container.style.maxWidth = "none";
    });
    element.style.overflow = "visible";
    element.style.maxWidth = "none";
    element.style.width = `${Math.max(
      element.clientWidth,
      ...tableWidths.map((width) => width + 56),
    )}px`;

    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );

    const captureWidth = Math.ceil(element.scrollWidth);
    const captureHeight = Math.ceil(element.scrollHeight);
    const maximumCanvasPixels = 28_000_000;
    const maximumCanvasSide = 30_000;
    const safeScale = Math.max(
      0.2,
      Math.min(
        1.75,
        Math.sqrt(maximumCanvasPixels / (captureWidth * captureHeight)),
        maximumCanvasSide / captureWidth,
        maximumCanvasSide / captureHeight,
      ),
    );

    canvas = await html2canvas(element, {
      scale: safeScale,
      width: captureWidth,
      height: captureHeight,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      onclone: (clonedDocument, clonedElement) => {
        normalizePdfCloneColors(clonedDocument.documentElement, false);
        normalizePdfCloneColors(clonedDocument.body, false);
        normalizePdfCloneColors(clonedElement);
        clonedElement.style.overflow = "visible";
        clonedElement
          .querySelectorAll<HTMLElement>("[data-pdf-table-scroll]")
          .forEach((container) => {
            container.style.overflow = "visible";
            container.style.maxWidth = "none";
          });
      },
    });
  } catch (captureError) {
    throw new Error(
      captureError instanceof Error
        ? `La préparation du PDF a échoué : ${captureError.message}`
        : "La préparation du PDF a échoué.",
    );
  } finally {
    originalStyles.forEach(({ target, cssText }) => {
      target.style.cssText = cssText;
    });
  }

  const pdfFormat =
    maximumColumns > 24
      ? "a1"
      : maximumColumns > 14
        ? "a2"
        : maximumColumns > 8
          ? "a3"
          : "a4";

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: pdfFormat,
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
  const pdfBlob = pdf.output("blob");
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
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
  const blue = "2563EB";
  const green = "10B981";
  const track = "E2E8F0";
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
  const noBorders = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE },
  };
  const brandCell = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text,
              bold: true,
              color: "FFFFFF",
              size: 30,
            }),
          ],
        }),
      ],
      shading: { fill: red, type: ShadingType.CLEAR },
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
  const progressBarTable = (
    baseline: number,
    current: number,
    gain: number,
  ) => {
    const safeCurrent = Math.max(0, Math.min(100, current));
    const safeBaseline = Math.max(0, Math.min(safeCurrent, baseline));
    const safeGain = Math.max(0, Math.min(safeCurrent - safeBaseline, gain));
    const acquired = Math.max(0, safeCurrent - safeGain);
    const remaining = Math.max(0, 100 - safeCurrent);
    const segments = [
      { value: acquired, color: blue },
      { value: safeGain, color: green },
      { value: remaining, color: track },
    ].filter((segment) => segment.value > 0);

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          height: { value: 120, rule: "exact" },
          children: segments.map(
            (segment) =>
              new TableCell({
                width: {
                  size: Math.max(1, segment.value),
                  type: WidthType.PERCENTAGE,
                },
                children: [new Paragraph({ children: [] })],
                shading: { fill: segment.color, type: ShadingType.CLEAR },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
              }),
          ),
        }),
      ],
    });
  };

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
            brandCell("ALSTOM"),
            new TableCell({
              children: [
                ...(data.showOncfLogo
                  ? [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: "ONCF",
                            bold: true,
                            color: "FFFFFF",
                            size: 30,
                          }),
                        ],
                      }),
                    ]
                  : []),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "MARCHÉ N° 625C07",
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
            brandCell("AVANZIT"),
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
      spacing: { after: 90 },
      children: [
        new TextRun({
          text: data.locationTitle.toUpperCase(),
          bold: true,
          color: red,
          size: 32,
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
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "AVANCEMENT GLOBAL",
                      bold: true,
                      color: "FFFFFF",
                      size: 18,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 80, after: 80 },
                  children: [
                    new TextRun({
                      text: `${data.metrics.globalProgress}%`,
                      bold: true,
                      color: "FFFFFF",
                      size: 42,
                    }),
                    new TextRun({
                      text: data.metrics.globalGainStatus.startsWith("État initial")
                        ? "   ÉTAT INITIAL"
                        : `   +${data.metrics.globalGain}% sur la période`,
                      bold: true,
                      color: green,
                      size: 22,
                    }),
                  ],
                }),
                progressBarTable(
                  data.metrics.globalBaseline,
                  data.metrics.globalProgress,
                  data.metrics.globalGain,
                ),
                new Paragraph({
                  spacing: { before: 80 },
                  children: [
                    new TextRun({
                      text: `Acquis ${data.metrics.globalBaseline}%   •   Gain +${data.metrics.globalGain}%   •   Reste ${Math.max(0, Math.round((100 - data.metrics.globalProgress) * 10) / 10)}%`,
                      color: "CBD5E1",
                      size: 16,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.metrics.globalSource,
                      color: "94A3B8",
                      italics: true,
                      size: 15,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: data.metrics.globalGainStatus,
                      color: "A7F3D0",
                      size: 15,
                    }),
                  ],
                }),
              ],
              shading: { fill: navy, type: ShadingType.CLEAR },
              margins: { top: 180, bottom: 180, left: 220, right: 220 },
            }),
          ],
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 140, after: 70 },
      children: [
        new TextRun({
          text: "AVANCEMENT GLOBAL PAR ACTIVITÉ",
          bold: true,
          color: navy,
          size: 17,
        }),
      ],
    }),
    ...data.activities.map(
      (activity) =>
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 42, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `${activity.code} - ${activity.name}`,
                          bold: true,
                          color: navy,
                          size: 16,
                        }),
                      ],
                    }),
                  ],
                  margins: { top: 70, bottom: 70, left: 100, right: 100 },
                }),
                new TableCell({
                  width: { size: 58, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      spacing: { after: 35 },
                      children: [
                        new TextRun({
                          text: `${activity.progress}%`,
                          bold: true,
                          color: blue,
                          size: 17,
                        }),
                        new TextRun({
                          text: `   +${activity.periodIncrease}%`,
                          bold: true,
                          color: green,
                          size: 16,
                        }),
                      ],
                    }),
                    progressBarTable(
                      activity.baselineProgress,
                      activity.progress,
                      activity.periodIncrease,
                    ),
                  ],
                  margins: { top: 70, bottom: 70, left: 100, right: 100 },
                }),
              ],
            }),
          ],
        }),
    ),
    new Paragraph({ spacing: { after: 100 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allBorders,
      rows: [
        new TableRow({
          children: [
            headerCell("Terminées"),
            headerCell("En cours"),
            headerCell("Non démarrées"),
            headerCell("Bloquées"),
            headerCell("Mises à jour"),
          ],
        }),
        new TableRow({
          children: [
            textCell(String(data.metrics.completed), true),
            textCell(String(data.metrics.inProgress), true),
            textCell(String(data.metrics.notStarted), true),
            textCell(String(data.metrics.blocked), true),
            textCell(String(data.metrics.updates), true),
          ],
        }),
      ],
    }),
    sectionTitle("2. AVANCEMENT PAR ACTIVITÉ"),
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
            text: `${activity.code} - ${activity.name}`,
            bold: true,
            color: navy,
            size: 22,
          }),
          new TextRun({
            text: `   ${activity.progress}%`,
            bold: true,
            color: blue,
            size: 24,
          }),
          new TextRun({
            text: `   +${activity.periodIncrease}%`,
            bold: true,
            color: green,
            size: 19,
          }),
        ],
      }),
      progressBarTable(
        activity.baselineProgress,
        activity.progress,
        activity.periodIncrease,
      ),
      new Paragraph({
        spacing: { before: 50, after: 90 },
        children: [
          new TextRun({
            text: `${activity.location} • ${activity.tasks.length} tâche(s)`,
            color: "475569",
            size: 17,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allBorders,
        rows: [
          ...activity.tasks.map(
            (task) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 42, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: task.title, bold: true, size: 17 }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${task.status} • ${task.prerequisiteStatus}`,
                            color: "64748B",
                            size: 15,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 35 },
                        children: [
                          new TextRun({
                            text: task.measurement,
                            color: "475569",
                            size: 14,
                          }),
                        ],
                      }),
                    ],
                    margins: { top: 85, bottom: 85, left: 100, right: 100 },
                  }),
                  new TableCell({
                    width: { size: 58, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 45 },
                        children: [
                          new TextRun({
                            text: `${task.currentProgress}%`,
                            bold: true,
                            color: blue,
                            size: 18,
                          }),
                          new TextRun({
                            text: `   +${task.periodIncrease}%`,
                            bold: true,
                            color: green,
                            size: 17,
                          }),
                        ],
                      }),
                      progressBarTable(
                        task.baselineProgress,
                        task.currentProgress,
                        task.periodIncrease,
                      ),
                      ...(task.buildingSteps.length
                        ? [
                            new Paragraph({
                              spacing: { before: 90, after: 40 },
                              children: [
                                new TextRun({
                                  text: "ÉTAPES DE CONSTRUCTION",
                                  bold: true,
                                  color: navy,
                                  size: 14,
                                }),
                              ],
                            }),
                            ...task.buildingSteps.map(
                              (step) =>
                                new Table({
                                  width: { size: 100, type: WidthType.PERCENTAGE },
                                  borders: noBorders,
                                  rows: [
                                    new TableRow({
                                      children: [
                                        new TableCell({
                                          width: { size: 40, type: WidthType.PERCENTAGE },
                                          children: [
                                            new Paragraph({
                                              children: [
                                                new TextRun({
                                                  text: step.label,
                                                  color: "475569",
                                                  size: 13,
                                                }),
                                              ],
                                            }),
                                          ],
                                          margins: { top: 25, bottom: 25, left: 0, right: 60 },
                                        }),
                                        new TableCell({
                                          width: { size: 60, type: WidthType.PERCENTAGE },
                                          children: [
                                            new Paragraph({
                                              alignment: AlignmentType.RIGHT,
                                              spacing: { after: 20 },
                                              children: [
                                                new TextRun({
                                                  text: `${step.progress}%`,
                                                  bold: true,
                                                  color: blue,
                                                  size: 13,
                                                }),
                                              ],
                                            }),
                                            progressBarTable(
                                              step.progress,
                                              step.progress,
                                              0,
                                            ),
                                          ],
                                          margins: { top: 25, bottom: 25, left: 60, right: 0 },
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                            ),
                          ]
                        : []),
                    ],
                    margins: { top: 85, bottom: 85, left: 100, right: 100 },
                  }),
                ],
              }),
          ),
        ],
      }),
    );
  }

  children.push(
    sectionTitle("3. RESSOURCES MOBILISÉES"),
    new Paragraph({
      children: [new TextRun({ text: "Outillages", bold: true, color: navy })],
    }),
    ...bulletParagraphs(data.resources.tools),
    new Paragraph({
      children: [new TextRun({ text: "Engins", bold: true, color: navy })],
    }),
    ...bulletParagraphs(data.resources.machines),
    new Paragraph({
      children: [
        new TextRun({
          text: "Équipements / matériaux",
          bold: true,
          color: navy,
        }),
      ],
    }),
    ...bulletParagraphs(data.resources.equipment),
    sectionTitle("4. TRAVAUX RÉALISÉS"),
    ...bulletParagraphs(data.completedWork),
  );

  children.push(
    new Paragraph({
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "PHOTOS DES TRAVAUX RÉALISÉS",
          bold: true,
          color: navy,
          size: 20,
        }),
      ],
    }),
  );
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
    sectionTitle("5. TRAVAUX EN COURS"),
    ...bulletParagraphs(data.ongoingWork),
    sectionTitle("6. BLOCAGES, RISQUES ET ALERTES"),
    ...bulletParagraphs(data.blockers),
    sectionTitle("7. PROCHAINES ÉTAPES"),
    ...bulletParagraphs(data.nextSteps),
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
