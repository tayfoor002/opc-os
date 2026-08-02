"use client";

export type CasaportBuildingStep = {
  code: string;
  label: string;
  progress: number;
};

export type CasaportTaskReading = {
  key: string;
  title: string;
  progressMode: "manual" | "quantity" | "building";
  workType: "standard" | "gc_building";
  progress: number;
  targetQuantity: number | null;
  completedQuantity: number;
  unit: string;
  steps: CasaportBuildingStep[];
};

export type CasaportActivityReading = {
  key: string;
  code: string;
  title: string;
  progress: number;
  tasks: CasaportTaskReading[];
};

export type CasaportReportReading = {
  fileName: string;
  globalProgress: number;
  activities: CasaportActivityReading[];
  warnings: string[];
};

type BarReading = {
  page: number;
  x1: number;
  x2: number;
  y: number;
  quantize?: number;
};

const WIDTH = 1429;
const HEIGHT = 2021;

const BUILDING_STEPS = [
  ["installation_implantation", "Installation et implantation"],
  ["terrassement", "Terrassement"],
  ["beton_proprete", "Béton de propreté"],
  ["semelles_ba", "Semelles BA"],
  ["longrines_ba", "Longrines BA"],
  ["poteaux_ba", "Poteaux BA"],
  ["caniveaux_regards", "Caniveaux et regards"],
  ["remblaiement_compactage", "Remblaiement et compactage"],
  ["dallage_arme", "Dallage armé"],
  ["maconnerie", "Maçonnerie"],
  ["chainages", "Chaînages"],
  ["poutres_plancher_haut", "Poutres et plancher haut"],
  ["etancheite", "Étanchéité"],
  ["enduits", "Enduits"],
  ["eclairage", "Éclairage"],
  ["climatisation", "Climatisation"],
  ["nettoyage", "Nettoyage"],
] as const;

const arteryTasks = [
  ["piquetages", "Piquetages", 7000, "ml"],
  ["confection_tranchees", "Confection des tranchées", 7000, "ml"],
  ["deroulage_buses", "Déroulage des buses", 28000, "ml"],
  ["fermeture_tranchees", "Fermeture des tranchées", 7000, "ml"],
  ["deroulage_cdte", "Déroulage de câble CDTE", 7000, "ml"],
  ["deroulage_sig", "Déroulage de câble SIG", 21000, "ml"],
  ["deroulage_energie", "Déroulage de câble Énergie", 7000, "ml"],
  ["deroulage_phed_fo", "Déroulage PHED FO", 21000, "ml"],
  ["soufflage_fo", "Soufflage FO", 14000, "ml"],
  ["tsv", "TSV", 10, "u"],
] as const;

const massifTasks = [
  ["piquetages_massifs", "Piquetages massifs"],
  ["confection_massifs", "Confection massifs"],
  ["ferraillage_massifs", "Ferraillage massifs"],
  ["coulage_beton_massifs", "Coulage béton massifs"],
] as const;

const mastTasks = [
  ["potences", "Potences", 11],
  ["portiques", "Portiques", 4],
  ["mats", "Mâts", 12],
] as const;

const campaignTasks = [
  ["moteurs_aiguilles", "Pose moteurs aiguilles & contrôleurs"],
  ["balises", "Pose et installation balises"],
  ["pedales", "Pose et installation pédales"],
  ["signaux", "Pose et installation signaux"],
  ["u71", "Pose et installation U71"],
  ["ci", "Pose et installation CI"],
] as const;

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : 0;
}

function isGreen(red: number, green: number, blue: number) {
  return green > 100 && green - red > 18 && green - blue > 2;
}

function barProgress(canvas: HTMLCanvasElement, reading: BarReading) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Impossible d’analyser les barres d’avancement.");
  const x1 = Math.round((reading.x1 / WIDTH) * canvas.width);
  const x2 = Math.round((reading.x2 / WIDTH) * canvas.width);
  const centerY = Math.round((reading.y / HEIGHT) * canvas.height);
  const pixels = context.getImageData(
    x1,
    Math.max(0, centerY - 2),
    Math.max(1, x2 - x1 + 1),
    5,
  );
  let greenColumns = 0;
  for (let x = 0; x < pixels.width; x += 1) {
    let greenVotes = 0;
    for (let y = 0; y < pixels.height; y += 1) {
      const index = (y * pixels.width + x) * 4;
      if (
        isGreen(
          pixels.data[index],
          pixels.data[index + 1],
          pixels.data[index + 2],
        )
      ) {
        greenVotes += 1;
      }
    }
    if (greenVotes >= 2) greenColumns += 1;
  }
  const raw = Math.max(
    0,
    Math.min(
      100,
      pixels.width <= 40 && greenColumns > 0
        ? greenColumns >= pixels.width - 2
          ? 100
          : ((greenColumns - 1) / (pixels.width - 1)) * 100
        : (greenColumns / pixels.width) * 100,
    ),
  );
  const quantum = reading.quantize ?? 1;
  return Math.max(0, Math.min(100, Math.round(raw / quantum) * quantum));
}

async function renderPages(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  if (pdf.numPages < 3) {
    await pdf.destroy();
    throw new Error(
      "Le rapport Casaport doit contenir au moins les 3 pages d’avancement.",
    );
  }

  const canvases: HTMLCanvasElement[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Impossible de préparer la page PDF.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      canvases.push(canvas);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return canvases;
}

function buildingTask(
  key: string,
  title: string,
  canvas: HTMLCanvasElement,
  x1: number,
  x2: number,
): CasaportTaskReading {
  const steps = BUILDING_STEPS.map(([code, label], index) => ({
    code,
    label,
    progress: barProgress(canvas, {
      page: 1,
      x1,
      x2,
      y: 1247 + index * 43.2,
      quantize: 5,
    }),
  }));
  return {
    key,
    title,
    progressMode: "building",
    workType: "gc_building",
    progress: average(steps.map((step) => step.progress)),
    targetQuantity: null,
    completedQuantity: 0,
    unit: "%",
    steps,
  };
}

function quantityTask(
  key: string,
  title: string,
  target: number,
  unit: string,
  progress: number,
): CasaportTaskReading {
  return {
    key,
    title,
    progressMode: "quantity",
    workType: "standard",
    progress,
    targetQuantity: target,
    completedQuantity: Math.round((target * progress) / 100),
    unit,
    steps: [],
  };
}

function manualTask(key: string, title: string, progress: number): CasaportTaskReading {
  return {
    key,
    title,
    progressMode: "manual",
    workType: "standard",
    progress,
    targetQuantity: null,
    completedQuantity: 0,
    unit: "%",
    steps: [],
  };
}

export async function parseCasaportProgressReport(
  file: File,
): Promise<CasaportReportReading> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Sélectionnez le rapport d’avancement Casaport au format PDF.");
  }
  if (file.size > 35 * 1024 * 1024) {
    throw new Error("Le rapport PDF doit faire moins de 35 Mo.");
  }

  const [page1, page2, page3] = await renderPages(file);
  const ratio = page1.width / page1.height;
  if (Math.abs(ratio - WIDTH / HEIGHT) > 0.015) {
    throw new Error(
      "Ce PDF ne correspond pas au gabarit du rapport d’avancement Gare de Casa Port.",
    );
  }

  const buildings = [
    buildingTask("lt_casa_port", "LT CASA PORT", page1, 470, 566),
    buildingTask("gl_2", "GL 2", page1, 1159, 1255),
  ];
  const arteries = arteryTasks.map(([key, title, target, unit], index) =>
    quantityTask(
      key,
      title,
      target,
      unit,
      barProgress(page2, {
        page: 2,
        x1: 470,
        x2: 1189,
        y: 176 + index * 66.7,
      }),
    ),
  );
  const massifs = massifTasks.map(([key, title], index) =>
    quantityTask(
      key,
      title,
      31,
      "u",
      barProgress(page2, {
        page: 2,
        x1: 469,
        x2: 500,
        y: 1016 + index * 66.7,
      }),
    ),
  );
  const masts = mastTasks.map(([key, title, target], index) =>
    quantityTask(
      key,
      title,
      target,
      "u",
      barProgress(page2, {
        page: 2,
        x1: 1159,
        x2: 1189,
        y: 1016 + index * 66.7,
      }),
    ),
  );
  const campaign = campaignTasks.map(([key, title], index) =>
    manualTask(
      key,
      title,
      barProgress(page2, {
        page: 2,
        x1: 469,
        x2: 1255,
        y: 1444 + index * 43.2,
      }),
    ),
  );
  const posts = ["LT CASA PORT", "GL 2"].flatMap((building, buildingIndex) =>
    [
      ["armoires_sig", "Installation armoires SIG"],
      ["equipements_energie", "Installation équipements énergie"],
      ["equipements_telecom", "Installation équipements télécom"],
    ].map(([key, title], index) =>
      manualTask(
        `${buildingIndex ? "gl2" : "lt"}_${key}`,
        `${building} - ${title}`,
        barProgress(page3, {
          page: 3,
          x1: buildingIndex ? 1159 : 470,
          x2: buildingIndex ? 1255 : 566,
          y: 229 + index * 43.5,
          quantize: 5,
        }),
      ),
    ),
  );

  const activities: CasaportActivityReading[] = [
    { key: "buildings", code: "CP-01", title: "Bâtiments (Génie civil)", progress: average(buildings.map((task) => task.progress)), tasks: buildings },
    { key: "arteries", code: "CP-02", title: "Artères de câbles", progress: average(arteries.map((task) => task.progress)), tasks: arteries },
    { key: "massifs", code: "CP-03", title: "Massifs", progress: average(massifs.map((task) => task.progress)), tasks: massifs },
    { key: "masts", code: "CP-04", title: "Mâts, potences et portiques", progress: average(masts.map((task) => task.progress)), tasks: masts },
    { key: "campaign", code: "CP-05", title: "Campagne (installations sol)", progress: average(campaign.map((task) => task.progress)), tasks: campaign },
    { key: "posts", code: "CP-06", title: "Postes techniques (équipements intérieurs)", progress: average(posts.map((task) => task.progress)), tasks: posts },
  ];

  return {
    fileName: file.name,
    globalProgress: Math.round(average(activities.map((activity) => activity.progress))),
    activities,
    warnings: [
      "Le PDF est composé d’images : les pourcentages sont lus depuis la longueur des barres.",
      "Les quantités réalisées sont estimées depuis ces pourcentages et restent modifiables avant validation.",
    ],
  };
}
