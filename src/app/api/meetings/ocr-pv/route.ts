import { NextResponse } from "next/server";

export const maxDuration = 120;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MEETING_TYPES = new Set([
  "coordination", "site", "technical", "safety", "client", "other",
]);

const agendaPointSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    discussion: { type: "string" },
    decision: { type: "string" },
    owner: { type: "string" },
    due_date: { type: "string" },
    status: { type: "string", enum: ["open", "done"] },
  },
  required: ["subject", "discussion", "decision", "owner", "due_date", "status"],
};

const pvSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    meeting_date: { type: "string" },
    start_time: { type: "string" },
    end_time: { type: "string" },
    location: { type: "string" },
    meeting_type: {
      type: "string",
      enum: ["coordination", "site", "technical", "safety", "client", "other"],
    },
    objective: { type: "string" },
    introduction: { type: "string" },
    participants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          role: { type: "string" },
        },
        required: ["name", "company", "role"],
      },
    },
    agenda_points: { type: "array", items: agendaPointSchema },
    general_notes: { type: "string" },
    next_meeting_date: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" } },
    uncertain_fragments: { type: "array", items: { type: "string" } },
    page_count: { type: "integer", minimum: 1 },
  },
  required: [
    "title", "meeting_date", "start_time", "end_time", "location",
    "meeting_type", "objective", "introduction", "participants",
    "agenda_points", "general_notes", "next_meeting_date", "confidence",
    "warnings", "uncertain_fragments", "page_count",
  ],
};

function dataUrl(file: File) {
  return file.arrayBuffer().then(
    (buffer) =>
      `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`,
  );
}

function extractOutputText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("");
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "La lecture manuscrite n’est pas configurée. Ajoutez OPENAI_API_KEY au serveur." },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const zone = String(form.get("zone") ?? "").trim().slice(0, 160);
    const requestedClassification = String(
      form.get("classification") ?? "coordination",
    );
    const classification = MEETING_TYPES.has(requestedClassification)
      ? requestedClassification
      : "coordination";
    const enhancedPages = form
      .getAll("enhanced_pages")
      .filter((value): value is File => value instanceof File)
      .slice(0, 12);

    if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Utilisez un PDF ou une image JPG, PNG ou WebP." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Le PV dépasse la limite de 25 Mo." },
        { status: 413 },
      );
    }
    if (!zone) {
      return NextResponse.json(
        { error: "Sélectionnez la zone chantier avant l’analyse." },
        { status: 400 },
      );
    }

    const originalUrl = await dataUrl(file);
    const enhancedUrls = await Promise.all(enhancedPages.map(dataUrl));
    const visualInputs: Array<
      | { type: string; filename: string; file_data: string }
      | { type: string; image_url: string; detail: string }
    > = file.type === "application/pdf"
      ? [{ type: "input_file", filename: file.name, file_data: originalUrl }]
      : [{ type: "input_image", image_url: originalUrl, detail: "original" }];
    visualInputs.push(
      ...enhancedUrls.map((image_url) => ({
        type: "input_image",
        image_url,
        detail: "original",
      })),
    );

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_OCR_MODEL || "gpt-5.5",
        store: false,
        instructions: [
          "Tu es un opérateur documentaire expert des procès-verbaux de chantier ferroviaire en français.",
          "Lis l'original et les vues renforcées du même document, puis recoupe chaque donnée.",
          "Transcris fidèlement l'écriture manuscrite, les tableaux, annotations, dates, noms propres et sigles.",
          "N'invente jamais. Si un fragment reste ambigu, choisis la lecture la plus probable seulement si elle est fortement étayée, ajoute le fragment à uncertain_fragments et explique dans warnings.",
          "Une valeur absente doit être une chaîne vide. Les dates doivent être YYYY-MM-DD et les heures HH:MM.",
          "Crée un titre professionnel court et fidèle au sujet principal si aucun titre explicite n'est lisible.",
          "Sépare chaque décision/action en un point. Conserve les responsables et échéances exactement quand ils sont lisibles.",
          `Le classement demandé par l'utilisateur est '${classification}' et la zone chantier est '${zone}'. Utilise ce classement comme meeting_type et mentionne la zone dans le titre si elle n'y figure pas déjà.`,
          "confidence mesure la fiabilité globale réelle entre 0 et 1, sans la surestimer.",
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Analyse ce PV manuscrit et restitue toutes les informations structurées." },
              ...visualInputs,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "handwritten_meeting_minutes",
            strict: true,
            schema: pvSchema,
          },
        },
        max_output_tokens: 12000,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const apiError = payload as { error?: { message?: string } };
      throw new Error(apiError.error?.message || "Le service de lecture a refusé le document.");
    }
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("La lecture n’a renvoyé aucun résultat exploitable.");
    const result = JSON.parse(outputText) as Record<string, unknown>;
    result.meeting_type = classification;
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analyse du PV impossible." },
      { status: 500 },
    );
  }
}
