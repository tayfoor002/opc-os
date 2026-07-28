"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CirclePlus,
  Edit3,
  Loader2,
  Mail,
  Network,
  Phone,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Company = "ALSTOM" | "AVANZIT";

type Collaborator = {
  id: string;
  project_id: string;
  employee_code: string;
  full_name: string;
  company: Company;
  role: string;
  profile: string | null;
  phone: string | null;
  email: string | null;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
};

type CollaboratorForm = {
  employee_code: string;
  full_name: string;
  company: Company;
  role: string;
  profile: string;
  phone: string;
  email: string;
  parent_id: string;
  active: boolean;
};

const emptyForm: CollaboratorForm = {
  employee_code: "",
  full_name: "",
  company: "ALSTOM",
  role: "",
  profile: "",
  phone: "",
  email: "",
  parent_id: "",
  active: true,
};

export function OrganizationWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "directory">("chart");
  const [company, setCompany] = useState<Company>("ALSTOM");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CollaboratorForm>(emptyForm);

  async function loadCollaborators() {
    setLoading(true);
    setError("");

    const project = await supabase
      .from("projects")
      .select("id")
      .eq("code", "PDD")
      .single();

    if (project.error) {
      setError(project.error.message);
      setLoading(false);
      return;
    }

    setProjectId(project.data.id);
    const result = await supabase
      .from("collaborators")
      .select("*")
      .eq("project_id", project.data.id)
      .order("sort_order")
      .order("full_name");

    if (result.error) {
      setError(
        `Le référentiel Organization n’est pas disponible : ${result.error.message}`,
      );
    } else {
      setCollaborators((result.data ?? []) as Collaborator[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
    void loadCollaborators();
    // loadCollaborators intentionally remains local to this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyCollaborators = collaborators.filter(
    (collaborator) => collaborator.company === company,
  );
  const visibleCollaborators = companyCollaborators.filter((collaborator) =>
    `${collaborator.full_name} ${collaborator.employee_code} ${collaborator.role} ${collaborator.profile ?? ""} ${collaborator.phone ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const roots = companyCollaborators.filter(
    (collaborator) =>
      !collaborator.parent_id ||
      !companyCollaborators.some((item) => item.id === collaborator.parent_id),
  );
  const activeCount = collaborators.filter((item) => item.active).length;
  const alstomCount = collaborators.filter(
    (item) => item.company === "ALSTOM" && item.active,
  ).length;
  const avanzitCount = collaborators.filter(
    (item) => item.company === "AVANZIT" && item.active,
  ).length;

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, company });
    setFormOpen(true);
  }

  function openEdit(collaborator: Collaborator) {
    setEditing(collaborator);
    setForm({
      employee_code: collaborator.employee_code,
      full_name: collaborator.full_name,
      company: collaborator.company,
      role: collaborator.role,
      profile: collaborator.profile ?? "",
      phone: collaborator.phone ?? "",
      email: collaborator.email ?? "",
      parent_id: collaborator.parent_id ?? "",
      active: collaborator.active,
    });
    setFormOpen(true);
  }

  async function saveCollaborator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !form.employee_code.trim() || !form.full_name.trim()) {
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      project_id: projectId,
      employee_code: form.employee_code.trim(),
      full_name: form.full_name.trim(),
      company: form.company,
      role: form.role.trim(),
      profile: form.profile.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      parent_id: form.parent_id || null,
      active: form.active,
      sort_order: editing?.sort_order ?? collaborators.length + 1,
    };

    const result = editing
      ? await supabase
          .from("collaborators")
          .update(payload)
          .eq("id", editing.id)
      : await supabase.from("collaborators").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadCollaborators();
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
            Référentiel projet
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[var(--opc-ink)]">
            Organization
          </h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">
            Organigramme et annuaire réutilisables dans Tasks, Materials, VT et Reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white"
        >
          <CirclePlus className="h-4 w-4" />
          Ajouter un collaborateur
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={UsersRound} label="Collaborateurs actifs" value={activeCount} />
        <Stat icon={Building2} label="Alstom" value={alstomCount} blue />
        <Stat icon={Building2} label="Avanzit" value={avanzitCount} violet />
        <Stat
          icon={Phone}
          label="Téléphones renseignés"
          value={collaborators.filter((item) => item.phone).length}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--opc-border)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <Toggle
              active={view === "chart"}
              onClick={() => setView("chart")}
              icon={Network}
              label="Organigramme"
            />
            <Toggle
              active={view === "directory"}
              onClick={() => setView("directory")}
              icon={UsersRound}
              label="Annuaire"
            />
            {(["ALSTOM", "AVANZIT"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCompany(value)}
                className={`rounded-lg px-3 py-2 text-xs font-black ${
                  company === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, ID, rôle, profil, téléphone..."
              className="w-full bg-transparent py-2.5 text-sm outline-none sm:w-80"
            />
          </div>
        </div>

        {error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid min-h-80 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" />
          </div>
        ) : null}

        {!loading && view === "chart" ? (
          <div className="overflow-x-auto p-6">
            {roots.length ? (
              <div className="min-w-[760px] space-y-4">
                {roots.map((root) => (
                  <OrganizationNode
                    key={root.id}
                    collaborator={root}
                    all={companyCollaborators}
                    level={0}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            ) : (
              <Empty company={company} />
            )}
          </div>
        ) : null}

        {!loading && view === "directory" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">ID</th>
                  <th className="px-5 py-4">Collaborateur</th>
                  <th className="px-5 py-4">Société</th>
                  <th className="px-5 py-4">Rôle</th>
                  <th className="px-5 py-4">Profil</th>
                  <th className="px-5 py-4">Téléphone</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleCollaborators.map((collaborator) => (
                  <tr
                    key={collaborator.id}
                    className="border-t border-slate-100 hover:bg-blue-50/30"
                  >
                    <td className="px-5 py-4 font-black text-[var(--opc-blue)]">
                      {collaborator.employee_code}
                    </td>
                    <td className="px-5 py-4 font-black">
                      {collaborator.full_name}
                    </td>
                    <td className="px-5 py-4">{collaborator.company}</td>
                    <td className="px-5 py-4">{collaborator.role}</td>
                    <td className="px-5 py-4">{collaborator.profile ?? "—"}</td>
                    <td className="px-5 py-4">{collaborator.phone ?? "—"}</td>
                    <td className="px-5 py-4">{collaborator.email ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          collaborator.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {collaborator.active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(collaborator)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] text-slate-600"
                        aria-label={`Modifier ${collaborator.full_name}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-[var(--opc-border)] p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[var(--opc-red)]">
                  {editing ? "Modification" : "Nouveau profil"}
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {editing ? editing.full_name : "Ajouter un collaborateur"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={saveCollaborator} className="grid gap-5 p-6 sm:grid-cols-2">
              <Field label="Identifiant hiérarchique">
                <input
                  required
                  value={form.employee_code}
                  onChange={(event) =>
                    setForm({ ...form, employee_code: event.target.value })
                  }
                  placeholder="ALS-015"
                  className="input"
                />
              </Field>
              <Field label="Nom complet">
                <input
                  required
                  value={form.full_name}
                  onChange={(event) =>
                    setForm({ ...form, full_name: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Société">
                <select
                  value={form.company}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      company: event.target.value as Company,
                      parent_id: "",
                    })
                  }
                  className="input"
                >
                  <option value="ALSTOM">Alstom</option>
                  <option value="AVANZIT">Avanzit</option>
                </select>
              </Field>
              <Field label="Rôle">
                <input
                  required
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                  placeholder="Project Manager"
                  className="input"
                />
              </Field>
              <Field label="Profil / spécialité">
                <input
                  value={form.profile}
                  onChange={(event) =>
                    setForm({ ...form, profile: event.target.value })
                  }
                  placeholder="OPC, VT, Materials..."
                  className="input"
                />
              </Field>
              <Field label="Responsable hiérarchique">
                <select
                  value={form.parent_id}
                  onChange={(event) =>
                    setForm({ ...form, parent_id: event.target.value })
                  }
                  className="input"
                >
                  <option value="">Aucun — niveau racine</option>
                  {collaborators
                    .filter(
                      (item) =>
                        item.company === form.company && item.id !== editing?.id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.full_name} — {item.role}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Téléphone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="+212 ..."
                  className="input"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--opc-border)] p-4 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm({ ...form, active: event.target.checked })
                  }
                  className="h-5 w-5 accent-[var(--opc-blue)]"
                />
                <span className="text-sm font-black">Profil actif et sélectionnable</span>
              </label>
              <div className="flex justify-end gap-3 border-t border-[var(--opc-border)] pt-5 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enregistrer
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      <style jsx>{`.input{width:100%;border:1px solid var(--opc-border);border-radius:.75rem;background:white;padding:.75rem .875rem;font-size:.875rem;outline:none}.input:focus{border-color:var(--opc-blue);box-shadow:0 0 0 4px rgba(0,80,164,.08)}`}</style>
    </div>
  );
}

function OrganizationNode({
  collaborator,
  all,
  level,
  onEdit,
}: {
  collaborator: Collaborator;
  all: Collaborator[];
  level: number;
  onEdit: (collaborator: Collaborator) => void;
}) {
  const children = all.filter((item) => item.parent_id === collaborator.id);
  return (
    <div style={{ marginLeft: `${Math.min(level, 4) * 32}px` }}>
      <button
        type="button"
        onClick={() => onEdit(collaborator)}
        className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition hover:shadow-md ${
          collaborator.active
            ? "border-[var(--opc-border)] bg-white"
            : "border-slate-200 bg-slate-50 opacity-60"
        }`}
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[var(--opc-blue)]">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-[var(--opc-ink)]">
              {collaborator.full_name}
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
              {collaborator.employee_code}
            </span>
          </div>
          <p className="mt-1 text-sm font-bold text-[var(--opc-blue)]">
            {collaborator.role}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            {collaborator.profile ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                {collaborator.profile}
              </span>
            ) : null}
            {collaborator.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {collaborator.phone}
              </span>
            ) : null}
            {collaborator.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {collaborator.email}
              </span>
            ) : null}
          </div>
        </div>
        <Edit3 className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {children.length ? (
        <div className="mt-3 space-y-3 border-l-2 border-blue-100 pl-4">
          {children.map((child) => (
            <OrganizationNode
              key={child.id}
              collaborator={child}
              all={all}
              level={level + 1}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Network;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${
        active
          ? "bg-[var(--opc-blue)] text-white"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  blue = false,
  violet = false,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  blue?: boolean;
  violet?: boolean;
}) {
  const color = blue
    ? "bg-blue-50 text-blue-700"
    : violet
      ? "bg-violet-50 text-violet-700"
      : "bg-slate-100 text-slate-600";
  return (
    <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--opc-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function Empty({ company }: { company: Company }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--opc-border)] text-center">
      <div>
        <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-black">Aucun collaborateur {company}</p>
        <p className="mt-1 text-sm text-slate-500">
          Ajoutez les profils pour construire cet organigramme.
        </p>
      </div>
    </div>
  );
}
