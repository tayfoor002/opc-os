import type { DocumentItem, MaterialItem, Zone } from "@/types/domain";

export const zones: Zone[] = [
  { id: "zone-a", name: "Zone A", code: "ZA", progress: 62, phaseCount: 3 },
  { id: "zone-b", name: "Zone B", code: "ZB", progress: 44, phaseCount: 3 },
  { id: "zone-c", name: "Zone C", code: "ZC", progress: 31, phaseCount: 3 },
  { id: "zone-d", name: "Zone D", code: "ZD", progress: 18, phaseCount: 3 }
];

export const documentCategories = [
  "Plans techniques",
  "Plans de pose",
  "Plans de déroulage",
  "TC Plans",
  "Plans d'aménagement bâtiment",
  "PV",
  "PVI",
  "Certificats de conformité",
  "ICP",
  "NDC",
  "Procédures"
];

export const materialCategories = [
  "Câbles",
  "Équipements Campagne",
  "Équipements Poste",
  "Structures",
  "Consommables"
];

export const documents: DocumentItem[] = [
  {
    id: "doc-001",
    name: "Plan de pose T01",
    category: "Plans de pose",
    revision: "B",
    status: "Validé",
    zone: "Zone A",
    phase: "Phase 2",
    activity: "Pose transformateur",
    company: "Entreprise Alpha",
    updatedAt: "2026-07-20"
  },
  {
    id: "doc-002",
    name: "PVI câbles signalisation",
    category: "PVI",
    revision: "A",
    status: "En revue",
    zone: "Zone B",
    phase: "Phase 1",
    activity: "Déroulage câbles",
    company: "Entreprise Beta",
    updatedAt: "2026-07-19"
  }
];

export const materials: MaterialItem[] = [
  {
    id: "mat-001",
    name: "Transformateur T01",
    category: "Équipements Poste",
    reference: "T01",
    status: "Livré",
    zone: "Zone A",
    phase: "Phase 2",
    activity: "Pose transformateur",
    quantity: 1,
    unit: "u"
  },
  {
    id: "mat-002",
    name: "Câble signalisation ZPFU",
    category: "Câbles",
    reference: "ZPFU-12P",
    status: "Commandé",
    zone: "Zone B",
    phase: "Phase 1",
    activity: "Déroulage câbles",
    quantity: 2400,
    unit: "m"
  }
];
