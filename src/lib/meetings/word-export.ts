import type { MeetingMinute } from "@/types/meeting";

async function loadMeetingImage(path: string) {
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
          result
            ? resolve(result)
            : reject(new Error("Conversion WebP impossible.")),
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

function fitMeetingImage(
  width: number,
  height: number,
  maximumWidth: number,
  maximumHeight: number,
) {
  const ratio = Math.min(maximumWidth / width, maximumHeight / height);
  return { width: width * ratio, height: height * ratio };
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadMeetingWord(
  meeting: MeetingMinute,
  fileName: string,
  showOncfLogo = false,
) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const borders = {
    top: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
    bottom: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
    left: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
    right: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
    insideHorizontal: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
    insideVertical: { style: BorderStyle.SINGLE, color: "D9E2EC", size: 1 },
  };
  const cell = (text: string, bold = false, color = "16233B") =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text: text || "—", bold, color, size: 18 })],
        }),
      ],
    });
  const sectionTitle = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, color: "E2001A", size: 10 },
      },
      children: [new TextRun({ text, bold: true, color: "16233B" })],
    });

  let nextSectionNumber = 4;
  const complementaryContent = [];
  if (meeting.custom_tables.length) {
    complementaryContent.push(
      sectionTitle(`${nextSectionNumber}. Tableaux complémentaires`),
    );
    nextSectionNumber += 1;
    for (const customTable of meeting.custom_tables) {
      complementaryContent.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          children: [
            new TextRun({
              text: customTable.title || "Tableau",
              bold: true,
              color: "005EB8",
            }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders,
          rows: [
            new TableRow({
              children: customTable.columns.map((column, index) =>
                cell(column || `Colonne ${index + 1}`, true),
              ),
            }),
            ...customTable.rows.map(
              (row) =>
                new TableRow({
                  children: customTable.columns.map((_, index) =>
                    cell(row[index] || "—"),
                  ),
                }),
            ),
          ],
        }),
      );
    }
  }

  if (meeting.photos.length) {
    complementaryContent.push(
      sectionTitle(`${nextSectionNumber}. Photographies`),
    );
    nextSectionNumber += 1;
    for (let index = 0; index < meeting.photos.length; index += 1) {
      const photo = meeting.photos[index];
      if (!photo.url) continue;
      try {
        const image = await loadMeetingImage(photo.url);
        const dimensions = fitMeetingImage(
          image.width,
          image.height,
          500,
          320,
        );
        complementaryContent.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 60 },
            children: [
              new ImageRun({
                data: image.bytes,
                type: image.type,
                transformation: dimensions,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: `Photo ${index + 1}${photo.caption ? ` — ${photo.caption}` : ""}`,
                italics: true,
                color: "526174",
                size: 18,
              }),
            ],
          }),
        );
      } catch {
        complementaryContent.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Photo ${index + 1} indisponible${photo.caption ? ` — ${photo.caption}` : ""}`,
                italics: true,
                color: "526174",
              }),
            ],
          }),
        );
      }
    }
  }
  const observationsSectionNumber = nextSectionNumber;
  const validationSectionNumber = nextSectionNumber + 1;

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
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
                  new TableCell({
                    shading: {
                      type: ShadingType.CLEAR,
                      fill: "E2001A",
                      color: "FFFFFF",
                    },
                    children: [
                      ...(showOncfLogo
                        ? [
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { before: 120, after: 60 },
                              children: [
                                new TextRun({
                                  text: "ONCF",
                                  bold: true,
                                  color: "FFFFFF",
                                  size: 28,
                                }),
                              ],
                            }),
                          ]
                        : []),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 150, after: 150 },
                        children: [
                          new TextRun({
                            text:
                              "ALSTOM     MARCHÉ N° 625C07 — PROGRAMME DE DÉVELOPPEMENT     AVANZIT",
                            bold: true,
                            color: "FFFFFF",
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 80 },
            children: [
              new TextRun({
                text: "COMPTE RENDU DE RÉUNION",
                bold: true,
                size: 32,
                color: "16233B",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [
              new TextRun({
                text: meeting.title.toUpperCase(),
                bold: true,
                size: 24,
                color: "005EB8",
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({
                children: [
                  cell("Date", true),
                  cell(meeting.meeting_date),
                  cell("Lieu", true),
                  cell(meeting.location ?? "—"),
                ],
              }),
              new TableRow({
                children: [
                  cell("Horaire", true),
                  cell(
                    [meeting.start_time, meeting.end_time]
                      .filter(Boolean)
                      .join(" — ") || "—",
                  ),
                  cell("Statut", true),
                  cell(meeting.status === "finalized" ? "Finalisé" : "Brouillon"),
                ],
              }),
            ],
          }),
          sectionTitle("1. Objet de la réunion"),
          new Paragraph(meeting.objective || "Non renseigné."),
          ...(meeting.introduction
            ? [
                new Paragraph({
                  spacing: { before: 100 },
                  children: [new TextRun(meeting.introduction)],
                }),
              ]
            : []),
          sectionTitle("2. Participants"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({
                children: [
                  cell("Nom", true),
                  cell("Organisme", true),
                  cell("Fonction", true),
                ],
              }),
              ...meeting.participants.map(
                (participant) =>
                  new TableRow({
                    children: [
                      cell(participant.name),
                      cell(participant.company || "Externe"),
                      cell(participant.role || "—"),
                    ],
                  }),
              ),
            ],
          }),
          sectionTitle("3. Points examinés, décisions et actions"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({
                children: [
                  cell("N°", true),
                  cell("Point / échanges", true),
                  cell("Décision / action", true),
                  cell("Responsable", true),
                  cell("Échéance", true),
                ],
              }),
              ...meeting.agenda_points.map(
                (point, index) =>
                  new TableRow({
                    children: [
                      cell(String(index + 1)),
                      cell(
                        [point.subject, point.discussion]
                          .filter(Boolean)
                          .join("\n"),
                      ),
                      cell(point.decision),
                      cell(point.owner),
                      cell(point.due_date),
                    ],
                  }),
              ),
            ],
          }),
          ...complementaryContent,
          sectionTitle(`${observationsSectionNumber}. Observations générales`),
          new Paragraph(meeting.general_notes || "Rien à signaler."),
          ...(meeting.next_meeting_date
            ? [
                new Paragraph({
                  spacing: { before: 200 },
                  children: [
                    new TextRun({
                      text: `Prochaine réunion prévue le : ${meeting.next_meeting_date}`,
                      bold: true,
                      color: "E2001A",
                    }),
                  ],
                }),
              ]
            : []),
          sectionTitle(`${validationSectionNumber}. Validation`),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              new TableRow({
                children: [
                  cell("Établi par\n\n\nNom / signature", true),
                  cell("Vérifié par\n\n\nNom / signature", true),
                  cell("Approuvé par\n\n\nNom / signature", true),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  saveBlob(
    await Packer.toBlob(document),
    fileName.endsWith(".docx") ? fileName : `${fileName}.docx`,
  );
}
