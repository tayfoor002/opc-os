export type Company = "ALSTOM" | "AVANZIT";

export type CollaboratorOption = {
  id: string;
  full_name: string;
  company: Company;
  role: string;
  profile: string | null;
  phone: string | null;
};

export type ZoneOption = {
  id: string;
  code: string;
  name: string;
};

export type PhaseOption = {
  id: string;
  zone_id: string;
  code: string;
  name: string;
};

export type ZoneElementOption = {
  id: string;
  zone_id: string;
  code: string;
  name: string;
  element_type: "site" | "bal";
};
