import type { MeetingMinute } from "@/types/meeting";

type LoadedPdfImage = {
  bytes: Uint8Array;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

async function loadPdfImage(path: string): Promise<LoadedPdfImage> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Image indisponible : ${path}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  if (blob.type.includes("webp")) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossible de convertir la photo WebP.");
    context.drawImage(bitmap, 0, 0);
    const converted = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Conversion WebP impossible.")),
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
    format: blob.type.includes("png") ? "PNG" : "JPEG",
    width: bitmap.width,
    height: bitmap.height,
  };
}

function meetingTypeLabel(type: MeetingMinute["meeting_type"]) {
  return {
    coordination: "Réunion de coordination",
    site: "Réunion chantier",
    technical: "Réunion technique",
    safety: "Réunion sécurité / EHS",
    client: "Réunion client",
    other: "Autre réunion",
  }[type];
}

function savePdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadMeetingPdf(
  meeting: MeetingMinute,
  fileName: string,
  showOncfLogo = false,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const maximumColumns = Math.max(
    0,
    ...meeting.custom_tables.map((table) => table.columns.length),
  );
  const format =
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
    format,
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = Math.max(10, pageWidth * 0.018);
  const contentWidth = pageWidth - margin * 2;
  const topMargin = 24;
  const bottomMargin = 16;
  let cursorY = 30;
  let sectionNumber = 1;

  const addPage = () => {
    pdf.addPage();
    cursorY = topMargin;
  };
  const ensureSpace = (height: number) => {
    if (cursorY + height > pageHeight - bottomMargin) addPage();
  };
  const sectionTitle = (title: string) => {
    ensureSpace(12);
    pdf.setDrawColor(226, 0, 26);
    pdf.setLineWidth(0.8);
    pdf.line(margin, cursorY + 7, pageWidth - margin, cursorY + 7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(22, 35, 59);
    pdf.text(`${sectionNumber}. ${title.toUpperCase()}`, margin, cursorY + 4);
    sectionNumber += 1;
    cursorY += 12;
  };
  const paragraph = (text: string, color: [number, number, number] = [82, 97, 116]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(text || "—", contentWidth) as string[];
    const lineHeight = 4.4;
    for (const line of lines) {
      ensureSpace(lineHeight + 1);
      pdf.text(line, margin, cursorY);
      cursorY += lineHeight;
    }
    cursorY += 2;
  };
  const tableFinalY = () =>
    (
      pdf as typeof pdf & {
        lastAutoTable?: { finalY: number };
      }
    ).lastAutoTable?.finalY ?? cursorY;
  const baseTableOptions = {
    theme: "grid" as const,
    margin: {
      top: topMargin,
      right: margin,
      bottom: bottomMargin,
      left: margin,
    },
    showHead: "everyPage" as const,
    rowPageBreak: "avoid" as const,
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: [22, 35, 59] as [number, number, number],
      lineColor: [217, 226, 236] as [number, number, number],
      lineWidth: 0.2,
      cellPadding: 2,
      overflow: "linebreak" as const,
      valign: "top" as const,
    },
    headStyles: {
      fillColor: [234, 243, 252] as [number, number, number],
      textColor: [0, 80, 164] as [number, number, number],
      fontStyle: "bold" as const,
      lineColor: [190, 210, 230] as [number, number, number],
    },
  };

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(16, 33, 58);
  pdf.setFontSize(19);
  pdf.text("COMPTE RENDU DE RÉUNION", pageWidth / 2, cursorY, {
    align: "center",
  });
  cursorY += 8;
  pdf.setFontSize(14);
  pdf.setTextColor(0, 80, 164);
  const titleLines = pdf.splitTextToSize(
    (meeting.title || "Titre de la réunion").toUpperCase(),
    contentWidth * 0.8,
  ) as string[];
  pdf.text(titleLines, pageWidth / 2, cursorY, { align: "center" });
  cursorY += titleLines.length * 6 + 3;
  pdf.setFontSize(9);
  pdf.text(meetingTypeLabel(meeting.meeting_type), pageWidth / 2, cursorY, {
    align: "center",
  });
  cursorY += 7;

  autoTable(pdf, {
    ...baseTableOptions,
    startY: cursorY,
    showHead: "never",
    body: [
      ["Date", meeting.meeting_date || "—", "Lieu", meeting.location || "—"],
      [
        "Horaire",
        [meeting.start_time, meeting.end_time].filter(Boolean).join(" - ") ||
          "—",
        "Statut",
        meeting.status === "finalized" ? "Finalisé" : "Brouillon",
      ],
      [
        "Zone chantier",
        meeting.zone_name || "Non classée",
        "Classement",
        meetingTypeLabel(meeting.meeting_type),
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [244, 248, 252] },
      2: { fontStyle: "bold", fillColor: [244, 248, 252] },
    },
  });
  cursorY = tableFinalY() + 7;

  sectionTitle("Objet de la réunion");
  paragraph(meeting.objective || "Objet non renseigné.");
  if (meeting.introduction) paragraph(meeting.introduction);

  sectionTitle("Participants");
  if (meeting.participants.length) {
    autoTable(pdf, {
      ...baseTableOptions,
      startY: cursorY,
      head: [["Nom", "Organisme", "Fonction"]],
      body: meeting.participants.map((participant) => [
        participant.name,
        participant.company || "Externe",
        participant.role || "—",
      ]),
    });
    cursorY = tableFinalY() + 7;
  } else {
    paragraph("Aucun participant sélectionné.");
  }

  sectionTitle("Points examinés, décisions et plan d’action");
  if (meeting.agenda_points.length) {
    autoTable(pdf, {
      ...baseTableOptions,
      startY: cursorY,
      head: [
        [
          "N°",
          "Point / échanges",
          "Décision / action",
          "Responsable",
          "Échéance",
          "État",
        ],
      ],
      body: meeting.agenda_points.map((point, index) => [
        String(index + 1),
        [point.subject, point.discussion].filter(Boolean).join("\n"),
        point.decision || "—",
        point.owner || "—",
        point.due_date || "—",
        point.status === "done" ? "Clôturé" : "Ouvert",
      ]),
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        4: { cellWidth: 24 },
        5: { cellWidth: 20, halign: "center" },
      },
    });
    cursorY = tableFinalY() + 7;
  } else {
    paragraph("Aucun point ajouté.");
  }

  for (const table of meeting.custom_tables) {
    sectionTitle(table.title || "Tableau complémentaire");
    const fontSize =
      table.columns.length > 24
        ? 5.5
        : table.columns.length > 14
          ? 6
          : table.columns.length > 8
            ? 6.5
            : 7.5;
    autoTable(pdf, {
      ...baseTableOptions,
      startY: cursorY,
      tableWidth: contentWidth,
      horizontalPageBreak: false,
      head: [
        table.columns.map(
          (column, index) => column || `Colonne ${index + 1}`,
        ),
      ],
      body: table.rows.map((row) =>
        table.columns.map((_, index) => row[index] || ""),
      ),
      styles: {
        ...baseTableOptions.styles,
        fontSize,
        cellPadding: table.columns.length > 14 ? 1.2 : 1.8,
        minCellWidth: 0,
      },
    });
    cursorY = tableFinalY() + 7;
  }

  if (meeting.photos.length) {
    sectionTitle("Photographies");
    const cardGap = 8;
    const cardWidth = (contentWidth - cardGap) / 2;
    const imageHeight = Math.min(95, pageHeight * 0.22);
    for (let index = 0; index < meeting.photos.length; index += 2) {
      ensureSpace(imageHeight + 18);
      const pair = meeting.photos.slice(index, index + 2);
      for (let offset = 0; offset < pair.length; offset += 1) {
        const photo = pair[offset];
        const x = margin + offset * (cardWidth + cardGap);
        pdf.setDrawColor(217, 226, 236);
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, cursorY, cardWidth, imageHeight + 14, 2, 2, "FD");
        if (photo.url) {
          try {
            const image = await loadPdfImage(photo.url);
            const ratio = Math.min(
              (cardWidth - 6) / image.width,
              (imageHeight - 6) / image.height,
            );
            const width = image.width * ratio;
            const height = image.height * ratio;
            pdf.addImage(
              image.bytes,
              image.format,
              x + (cardWidth - width) / 2,
              cursorY + (imageHeight - height) / 2,
              width,
              height,
              undefined,
              "FAST",
            );
          } catch {
            pdf.setFontSize(8);
            pdf.setTextColor(120, 130, 145);
            pdf.text("Photo indisponible", x + cardWidth / 2, cursorY + 20, {
              align: "center",
            });
          }
        }
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(82, 97, 116);
        const caption = `Photo ${index + offset + 1}${
          photo.caption ? ` - ${photo.caption}` : ""
        }`;
        pdf.text(
          (pdf.splitTextToSize(caption, cardWidth - 6) as string[]).slice(0, 2),
          x + 3,
          cursorY + imageHeight + 5,
        );
      }
      cursorY += imageHeight + 20;
    }
  }

  sectionTitle("Observations générales");
  paragraph(meeting.general_notes || "Rien à signaler.");
  if (meeting.next_meeting_date) {
    paragraph(
      `Prochaine réunion prévue le : ${meeting.next_meeting_date}`,
      [226, 0, 26],
    );
  }

  sectionTitle("Validation");
  autoTable(pdf, {
    ...baseTableOptions,
    startY: cursorY,
    showHead: "never",
    body: [
      [
        "Établi par\n\n\nNom / signature",
        "Vérifié par\n\n\nNom / signature",
        "Approuvé par\n\n\nNom / signature",
      ],
    ],
    styles: {
      ...baseTableOptions.styles,
      halign: "center",
      minCellHeight: 28,
      fontStyle: "bold",
    },
  });

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFillColor(226, 0, 26);
    pdf.rect(0, 0, pageWidth, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("ALSTOM", margin, 11);
    pdf.text("AVANZIT", pageWidth - margin, 11, { align: "right" });
    pdf.setFontSize(7);
    if (showOncfLogo) {
      pdf.setFontSize(10);
      pdf.text("ONCF", pageWidth / 2, 6, { align: "center" });
      pdf.setFontSize(6.5);
      pdf.text(
        "MARCHÉ N° 625C07 - PROGRAMME DE DÉVELOPPEMENT",
        pageWidth / 2,
        12,
        { align: "center" },
      );
    } else {
      pdf.text(
        "MARCHÉ N° 625C07 - PROGRAMME DE DÉVELOPPEMENT",
        pageWidth / 2,
        10,
        { align: "center" },
      );
    }
    pdf.setTextColor(100, 110, 125);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text(
      `CR du ${meeting.meeting_date} - Page ${page}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" },
    );
  }

  savePdfBlob(pdf.output("blob"), fileName);
}
