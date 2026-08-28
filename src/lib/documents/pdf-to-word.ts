export async function convertPdfBlobToWord(pdfBlob: Blob): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const { AlignmentType, Document, ImageRun, Packer, Paragraph } = await import("docx");
  const pdf = await pdfjs.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Conversion de la page PDF impossible.");

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const pageImage = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Image de page impossible à créer."))),
          "image/png",
        );
      });
      const sourceWidth = viewport.width;
      const sourceHeight = viewport.height;
      const maximumWidth = 760;
      const maximumHeight = 1074;
      const ratio = Math.min(maximumWidth / sourceWidth, maximumHeight / sourceHeight);

      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: pageNumber > 1,
          spacing: { before: 0, after: 0, line: 1 },
          children: [
            new ImageRun({
              data: new Uint8Array(await pageImage.arrayBuffer()),
              type: "png",
              transformation: {
                width: Math.round(sourceWidth * ratio),
                height: Math.round(sourceHeight * ratio),
              },
            }),
          ],
        }),
      );
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const wordDocument = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 100, right: 100, bottom: 100, left: 100 },
          },
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBlob(wordDocument);
}
