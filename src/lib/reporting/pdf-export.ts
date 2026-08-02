"use client";

import type { ReportExportData } from "./exports";

type PdfImage = {
  bytes: Uint8Array;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

async function loadPdfImage(
  path: string,
  monochromeWhite = false,
): Promise<PdfImage> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Image indisponible : ${path}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  if (blob.type.includes("webp") || monochromeWhite) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversion WebP impossible.");
    context.drawImage(bitmap, 0, 0);
    if (monochromeWhite) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        if (pixels.data[index + 3] > 0) {
          pixels.data[index] = 255;
          pixels.data[index + 1] = 255;
          pixels.data[index + 2] = 255;
        }
      }
      context.putImageData(pixels, 0, 0);
    }
    const converted = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Conversion WebP impossible.")),
        "image/png",
      ),
    );
    return {
      bytes: new Uint8Array(await converted.arrayBuffer()),
      format: "PNG",
      width: bitmap.width,
      height: bitmap.height,
    };
  }
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    format: blob.type.includes("jpeg") ? "JPEG" : "PNG",
    width: bitmap.width,
    height: bitmap.height,
  };
}

function fitInside(
  sourceWidth: number,
  sourceHeight: number,
  maximumWidth: number,
  maximumHeight: number,
) {
  const ratio = Math.min(
    maximumWidth / sourceWidth,
    maximumHeight / sourceHeight,
  );
  return {
    width: sourceWidth * ratio,
    height: sourceHeight * ratio,
  };
}

function slugDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadReportPdf(
  data: ReportExportData,
  fileName = `rapport-pdd-${slugDate()}.pdf`,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const red: [number, number, number] = [237, 27, 47];
  const navy: [number, number, number] = [15, 39, 71];
  const blue: [number, number, number] = [0, 80, 164];
  const slate: [number, number, number] = [71, 85, 105];
  const pale: [number, number, number] = [234, 242, 250];
  const border: [number, number, number] = [216, 225, 234];
  let y = 31;
  let logo: PdfImage | null = null;

  try {
    logo = await loadPdfImage("/alstom-logo.png", true);
  } catch {
    // The text fallback below keeps the report usable without the asset.
  }

  const header = () => {
    pdf.setFillColor(...red);
    pdf.rect(0, 0, pageWidth, 23, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    if (data.showOncfLogo) {
      pdf.setFontSize(12);
      pdf.text("ONCF", pageWidth / 2, 5.5, { align: "center" });
    }
    pdf.setFontSize(9);
    pdf.text(
      "MARCHÉ N° 625C07",
      pageWidth / 2,
      data.showOncfLogo ? 11 : 8,
      { align: "center" },
    );
    pdf.setFontSize(12);
    pdf.text(
      "PROGRAMME DE DÉVELOPPEMENT",
      pageWidth / 2,
      data.showOncfLogo ? 18 : 15,
      {
        align: "center",
      },
    );
    if (logo) {
      const dimensions = fitInside(logo.width, logo.height, 34, 13);
      pdf.addImage(
        logo.bytes,
        logo.format,
        margin,
        (23 - dimensions.height) / 2,
        dimensions.width,
        dimensions.height,
      );
    } else {
      pdf.text("ALSTOM", margin, 13);
    }
    pdf.text("AVANZIT", pageWidth - margin, 13, { align: "right" });
    y = 31;
  };

  const newPage = () => {
    pdf.addPage();
    header();
  };
  const ensure = (height: number) => {
    if (y + height > pageHeight - 14) newPage();
  };
  const wrapped = (
    text: string,
    x: number,
    width: number,
    options: {
      size?: number;
      color?: [number, number, number];
      bold?: boolean;
      lineHeight?: number;
    } = {},
  ) => {
    const size = options.size ?? 8;
    const lineHeight = options.lineHeight ?? size * 0.42;
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color ?? navy));
    const lines = pdf.splitTextToSize(text || "-", width) as string[];
    pdf.text(lines, x, y);
    y += Math.max(lineHeight, lines.length * lineHeight);
  };
  const section = (number: number, title: string) => {
    ensure(12);
    pdf.setFillColor(...pale);
    pdf.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, "F");
    pdf.setFillColor(...red);
    pdf.rect(margin, y, 2.5, 9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...navy);
    pdf.text(`${number}. ${title}`, margin + 5, y + 6);
    y += 13;
  };
  const bullets = (values: string[]) => {
    for (const value of values.length ? values : ["Aucune information saisie."]) {
      const lines = pdf.splitTextToSize(value, contentWidth - 9) as string[];
      ensure(lines.length * 3.8 + 3);
      pdf.setFillColor(...red);
      pdf.circle(margin + 2, y - 1, 0.7, "F");
      wrapped(value, margin + 6, contentWidth - 8, {
        color: slate,
        size: 8.5,
        lineHeight: 3.8,
      });
      y += 1.5;
    }
  };

  header();
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...navy);
  pdf.setFontSize(19);
  pdf.text(data.reportTitle.toUpperCase(), pageWidth / 2, y + 5, {
    align: "center",
  });
  pdf.setTextColor(...blue);
  pdf.setFontSize(11);
  pdf.text(data.periodTitle, pageWidth / 2, y + 12, { align: "center" });
  pdf.setTextColor(...slate);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(data.periodRange, pageWidth / 2, y + 18, { align: "center" });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...red);
  pdf.text(data.scopeTitle, pageWidth / 2, y + 23, { align: "center" });
  y += 30;

  section(1, "SYNTHÈSE EXÉCUTIVE");
  const metrics: Array<[string, string | number]> = [
    ["Terminées", data.metrics.completed],
    ["En cours", data.metrics.inProgress],
    ["Bloquées", data.metrics.blocked],
    ["Avancement moyen", `${data.metrics.averageProgress}%`],
    ["Gain période", `+${data.metrics.periodIncrease} pts`],
    ["Mises à jour", data.metrics.updates],
  ];
  const metricGap = 3;
  const metricWidth =
    (contentWidth - metricGap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = margin + index * (metricWidth + metricGap);
    pdf.setDrawColor(...border);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, y, metricWidth, 20, 2, 2, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...red);
    pdf.setFontSize(14);
    pdf.text(String(value), x + metricWidth / 2, y + 9, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...slate);
    pdf.setFontSize(7);
    pdf.text(label, x + metricWidth / 2, y + 16, { align: "center" });
  });
  y += 25;

  section(2, "DÉTAIL DES ACTIVITÉS ET TÂCHES");
  if (!data.activities.length) {
    wrapped("Aucune activité disponible pour cette période.", margin, contentWidth, {
      color: slate,
      size: 9,
    });
  }
  let currentZone = "";
  for (const activity of data.activities) {
    if (activity.zone !== currentZone) {
      currentZone = activity.zone;
      ensure(14);
      pdf.setFillColor(...red);
      pdf.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.text(`ZONE : ${currentZone.toUpperCase()}`, margin + 4, y + 6);
      y += 13;
    }
    ensure(28);
    pdf.setFillColor(...navy);
    pdf.roundedRect(margin, y, contentWidth, 11, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text(`${activity.code} - ${activity.name}`, margin + 4, y + 7);
    pdf.text(`${activity.progress}%`, pageWidth - margin - 4, y + 7, {
      align: "right",
    });
    y += 15;
    wrapped(
      `${activity.location} | Alstom: ${activity.alstom} | Avanzit: ${activity.avanzit}`,
      margin + 2,
      contentWidth - 4,
      { color: slate, size: 7.5, lineHeight: 3.4 },
    );
    y += 2;
    if (!activity.tasks.length) {
      wrapped("Aucune tâche associée.", margin + 3, contentWidth - 6, {
        color: slate,
      });
    }
    for (const task of activity.tasks) {
      const summaryLines = pdf.splitTextToSize(
        task.workSummary || "-",
        contentWidth - 169,
      ) as string[];
      const rowHeight = Math.max(23, summaryLines.length * 3.4 + 8);
      ensure(rowHeight + 3);
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(...border);
      pdf.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...navy);
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(task.title, 56) as string[], margin + 3, y + 5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...slate);
      pdf.setFontSize(7);
      pdf.text(
        [
          `État: ${task.status}`,
          `Prérequis: ${task.prerequisiteStatus}`,
          task.prerequisiteDetails,
          `Alstom: ${task.alstom}`,
          `Avanzit: ${task.avanzit}`,
        ],
        margin + 62,
        y + 5,
      );
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...blue);
      pdf.text(
        [
          `Actuel: ${task.currentProgress}%`,
          `Gain: +${task.periodIncrease} pts`,
          `Quantité: ${task.quantitySummary}`,
          `Rendement: ${task.periodOutput}`,
          `Contribution: ${task.activityContribution.toFixed(1)} pts`,
          `Gain activité: +${task.periodContribution.toFixed(1)} pts`,
        ],
        margin + 112,
        y + 5,
      );
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...slate);
      pdf.text(summaryLines, margin + 169, y + 5);
      y += rowHeight + 3;
    }
    y += 2;
  }

  section(3, "RESSOURCES MOBILISÉES");
  wrapped("Outillages", margin, contentWidth, { bold: true, size: 9 });
  bullets(data.resources.tools);
  wrapped("Engins", margin, contentWidth, { bold: true, size: 9 });
  bullets(data.resources.machines);
  wrapped("Équipements / matériaux", margin, contentWidth, {
    bold: true,
    size: 9,
  });
  bullets(data.resources.equipment);

  section(4, "TRAVAUX RÉALISÉS");
  bullets(data.completedWork);
  section(5, "TRAVAUX EN COURS");
  bullets(data.ongoingWork);
  section(6, "BLOCAGES, RISQUES ET ALERTES");
  bullets(data.blockers);
  section(7, "PROCHAINES ÉTAPES");
  bullets(data.nextSteps);

  section(8, "PLANCHES PHOTOGRAPHIQUES");
  if (!data.photos.length) {
    wrapped("Aucune photo d’avancement enregistrée pour cette période.", margin, contentWidth, {
      color: slate,
      size: 9,
    });
  }
  for (let index = 0; index < data.photos.length; index += 2) {
    ensure(72);
    const pair = data.photos.slice(index, index + 2);
    const gap = 6;
    const cardWidth = (contentWidth - gap) / 2;
    for (let offset = 0; offset < pair.length; offset += 1) {
      const photo = pair[offset];
      const x = margin + offset * (cardWidth + gap);
      pdf.setDrawColor(...border);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(x, y, cardWidth, 67, 2, 2, "FD");
      try {
        const image = await loadPdfImage(photo.url);
        const dimensions = fitInside(
          image.width,
          image.height,
          cardWidth - 6,
          43,
        );
        pdf.addImage(
          image.bytes,
          image.format,
          x + (cardWidth - dimensions.width) / 2,
          y + 3 + (43 - dimensions.height) / 2,
          dimensions.width,
          dimensions.height,
        );
      } catch {
        pdf.setTextColor(...slate);
        pdf.setFontSize(8);
        pdf.text("Photo indisponible", x + cardWidth / 2, y + 25, {
          align: "center",
        });
      }
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...navy);
      pdf.setFontSize(7.5);
      pdf.text(`Photo ${index + offset + 1} - ${photo.activity}`, x + 3, y + 51);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...slate);
      pdf.setFontSize(6.8);
      pdf.text(`${photo.task} | ${photo.date}`, x + 3, y + 56);
      const caption = pdf.splitTextToSize(photo.caption || "-", cardWidth - 6) as string[];
      pdf.text(caption.slice(0, 2), x + 3, y + 61);
    }
    y += 72;
  }

  section(9, "VISA ET VALIDATION");
  ensure(32);
  const signatureWidth = (contentWidth - 6) / 2;
  ["ALSTOM", "AVANZIT"].forEach((label, index) => {
    const x = margin + index * (signatureWidth + 6);
    pdf.setDrawColor(...border);
    pdf.rect(x, y, signatureWidth, 28);
    pdf.setFillColor(...red);
    pdf.rect(x, y, signatureWidth, 8, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text(label, x + signatureWidth / 2, y + 5.5, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...slate);
    pdf.setFontSize(7);
    pdf.text("Nom, date et signature", x + 4, y + 15);
  });

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...border);
    pdf.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...slate);
    pdf.text(
      `OPC OS — Rapport généré le ${new Date().toLocaleDateString("fr-FR")}`,
      margin,
      pageHeight - 5,
    );
    pdf.text(`Page ${page} / ${pageCount}`, pageWidth - margin, pageHeight - 5, {
      align: "right",
    });
  }
  pdf.save(fileName);
}
