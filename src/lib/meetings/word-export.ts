import type { MeetingMinute } from "@/types/meeting";

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
                              "ALSTOM     MARCHÉ N° 625C07 PDD — PROGRAMME DE DÉVELOPPEMENT     AVANZIT",
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
          sectionTitle("4. Observations générales"),
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
          sectionTitle("5. Validation"),
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
