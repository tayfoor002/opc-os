"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Layers3, MapPinned, Workflow } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type ScopeRow = {
  id: string;
  name: string;
  code: string;
  zone_id?: string;
};

type ScopeOptions = {
  zones: ScopeRow[];
  phases: ScopeRow[];
  packages: ScopeRow[];
};

type SavedScope = {
  zone: string;
  phase: string;
  wp: string;
};

let scopeOptionsPromise: Promise<ScopeOptions> | null = null;

function loadScopeOptions(): Promise<ScopeOptions> {
  if (scopeOptionsPromise) {
    return scopeOptionsPromise;
  }

  scopeOptionsPromise = (async () => {
    const supabase = createClient();
    const project = await supabase
      .from("projects")
      .select("id")
      .eq("code", "PDD")
      .single();

    if (project.error) {
      throw project.error;
    }

    const [zones, phases, packages] = await Promise.all([
      supabase
        .from("zones")
        .select("id,code,name")
        .eq("project_id", project.data.id)
        .order("sort_order"),
      supabase
        .from("phases")
        .select("id,code,name,zone_id")
        .eq("project_id", project.data.id)
        .order("sort_order"),
      supabase
        .from("work_packages")
        .select("id,code,name")
        .eq("project_id", project.data.id)
        .order("sort_order"),
    ]);

    const firstError = [zones.error, phases.error, packages.error].find(
      Boolean,
    );
    if (firstError) {
      throw firstError;
    }

    return {
      zones: zones.data ?? [],
      phases: phases.data ?? [],
      packages: packages.data ?? [],
    };
  })().catch((error: unknown) => {
    scopeOptionsPromise = null;
    throw error;
  });

  return scopeOptionsPromise;
}

function readSavedScope(): SavedScope {
  try {
    const value = JSON.parse(
      localStorage.getItem("opc_scope") ?? "{}",
    ) as Partial<SavedScope>;

    return {
      zone: value.zone ?? "",
      phase: value.phase ?? "",
      wp: value.wp ?? "",
    };
  } catch {
    return { zone: "", phase: "", wp: "" };
  }
}

export function GlobalScopeBar() {
  const [zones, setZones] = useState<ScopeRow[]>([]);
  const [phases, setPhases] = useState<ScopeRow[]>([]);
  const [packages, setPackages] = useState<ScopeRow[]>([]);
  const [zone, setZone] = useState("");
  const [phase, setPhase] = useState("");
  const [wp, setWp] = useState("");

  useEffect(() => {
    let active = true;
    const saved = readSavedScope();
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      setZone(saved.zone);
      setPhase(saved.phase);
      setWp(saved.wp);
    });

    void loadScopeOptions()
      .then((options) => {
        if (!active) {
          return;
        }
        setZones(options.zones);
        setPhases(options.phases);
        setPackages(options.packages);
      })
      .catch(() => {
        // Keep the scope selectors empty; the rest of the application remains usable.
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredPhases = zone
    ? phases.filter((item) => item.zone_id === zone)
    : phases;

  function persist(next: SavedScope) {
    localStorage.setItem("opc_scope", JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("opc-scope-change", { detail: next }),
    );
  }

  function changeZone(value: string) {
    setZone(value);
    setPhase("");
    persist({ zone: value, phase: "", wp });
  }

  function changePhase(value: string) {
    setPhase(value);
    persist({ zone, phase: value, wp });
  }

  function changeWp(value: string) {
    setWp(value);
    persist({ zone, phase, wp: value });
  }

  return (
    <div className="border-b border-[var(--opc-border)] bg-white px-6 py-3">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 font-black text-[var(--opc-ink)]">PDD</span>
        <Scope icon={MapPinned} value={zone} onChange={changeZone}>
          <option value="">Toutes les zones</option>
          {zones.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Scope>
        <Scope icon={Workflow} value={phase} onChange={changePhase}>
          <option value="">Toutes les phases</option>
          {filteredPhases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Scope>
        <Scope icon={Layers3} value={wp} onChange={changeWp}>
          <option value="">Tous les lots</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Scope>
        <span className="ml-auto text-xs font-bold text-slate-400">
          Filtre global actif dans OPC OS
        </span>
      </div>
    </div>
  );
}

function Scope({
  icon: Icon,
  value,
  onChange,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3 py-2">
      <Icon className="h-4 w-4 text-[var(--opc-blue)]" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent font-bold outline-none"
      >
        {children}
      </select>
    </label>
  );
}
