export type Status = "Brouillon" | "En revue" | "Validé" | "Rejeté" | "Archivé";

export interface Zone {
  id: string;
  name: string;
  code: string;
  progress: number;
  phaseCount: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  category: string;
  revision: string;
  status: Status;
  zone: string;
  phase: string;
  activity: string;
  company: string;
  updatedAt: string;
}

export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  reference: string;
  status: "Prévu" | "Commandé" | "Livré" | "Installé";
  zone: string;
  phase: string;
  activity: string;
  quantity: number;
  unit: string;
}
