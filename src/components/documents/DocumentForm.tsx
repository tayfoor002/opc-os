"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";

import { loadDocumentRelationOptions } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  DocumentActionResult,
  DocumentEditValues,
  DocumentRelationOptions,
  ProjectOption,
} from "@/lib/documents/types";

type DocumentFormProps = {
  initialValues: DocumentEditValues;
  projects: ProjectOption[];
  initialOptions: DocumentRelationOptions;
  onCancel: () => void;
  onSuccess: () => void;
  onSubmitForm: (formData: FormData) => Promise<DocumentActionResult>;
  submitLabel?: string;
  submittingLabel?: string;
  canSubmit?: boolean;
  children?: React.ReactNode;
};

type FieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
};

function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function optionLabel(option: { code: string | null; name: string }) {
  return option.code ? `${option.code} — ${option.name}` : option.name;
}

export function DocumentForm({
  initialValues,
  projects,
  initialOptions,
  onCancel,
  onSuccess,
  onSubmitForm,
  submitLabel = "Enregistrer",
  submittingLabel = "Enregistrement…",
  canSubmit = true,
  children,
}: DocumentFormProps) {
  const [values, setValues] = useState(initialValues);
  const [options, setOptions] = useState(initialOptions);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [isSaving, startSaving] = useTransition();
  const [isLoadingOptions, startLoadingOptions] = useTransition();

  function setValue<Key extends keyof DocumentEditValues>(
    key: Key,
    value: DocumentEditValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError("");
  }

  function changeProject(projectId: string) {
    setValues((current) => ({
      ...current,
      project_id: projectId,
      zone_id: "",
      phase_id: "",
      activity_id: "",
    }));
    setOptions({ zones: [], phases: [], activities: [] });
    setError("");

    if (!projectId) {
      return;
    }

    startLoadingOptions(async () => {
      const result = await loadDocumentRelationOptions(projectId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOptions(result.options);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value);
    });

    startSaving(async () => {
      const result = await onSubmitForm(formData);
      if (!result.success) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSuccess();
    });
  }

  const filteredPhases = values.zone_id
    ? options.phases.filter((phase) => phase.zone_id === values.zone_id)
    : options.phases;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Titre"
          htmlFor="document-title"
          error={fieldErrors.title?.[0]}
        >
          <Input
            id="document-title"
            value={values.title}
            onChange={(event) => setValue("title", event.target.value)}
            disabled={isSaving}
            required
          />
        </Field>

        <Field
          label="Projet"
          htmlFor="document-project"
          error={fieldErrors.project_id?.[0]}
        >
          <select
            id="document-project"
            value={values.project_id}
            onChange={(event) => changeProject(event.target.value)}
            disabled={isSaving || isLoadingOptions}
            className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            required
          >
            <option value="">Sélectionner un projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {optionLabel(project)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Référence"
          htmlFor="document-reference"
          error={fieldErrors.reference?.[0]}
        >
          <Input
            id="document-reference"
            value={values.reference}
            onChange={(event) => setValue("reference", event.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Révision"
          htmlFor="document-revision"
          error={fieldErrors.revision?.[0]}
        >
          <Input
            id="document-revision"
            value={values.revision}
            onChange={(event) => setValue("revision", event.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Statut"
          htmlFor="document-status"
          error={fieldErrors.status?.[0]}
        >
          <Input
            id="document-status"
            value={values.status}
            onChange={(event) => setValue("status", event.target.value)}
            disabled={isSaving}
            required
          />
        </Field>

        <Field
          label="Type de document"
          htmlFor="document-type"
          error={fieldErrors.document_type?.[0]}
        >
          <select
            id="document-type"
            value={values.document_type}
            onChange={(event) => {
              const documentType = event.target.value;
              setValues((current) => ({
                ...current,
                document_type: documentType,
                document_subcategory: "",
                execution_status:
                  documentType === "plan" ? "pending" : "not_applicable",
              }));
            }}
            disabled={isSaving}
            className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="plan">Plan</option>
            <option value="procedure">Procédure</option>
            <option value="pv">PV</option>
            <option value="icp">ICP</option>
            <option value="pvi">PVI</option>
            <option value="ndc">NDC — Note de calcul</option>
            <option value="other">Autre</option>
          </select>
        </Field>

        {values.document_type === "plan" ||
        values.document_type === "procedure" ? (
          <Field
            label="Sous-catégorie"
            htmlFor="document-subcategory"
            error={fieldErrors.document_subcategory?.[0]}
          >
            <select
              id="document-subcategory"
              value={values.document_subcategory}
              onChange={(event) =>
                setValue("document_subcategory", event.target.value)
              }
              disabled={isSaving}
              className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <option value="">À définir</option>
              {values.document_type === "plan" ? (
                <>
                  <option value="plan_pose">Plan de pose</option>
                  <option value="plan_deroulage">Plan de déroulage</option>
                  <option value="tcr_plan">TCR Plan</option>
                  <option value="gc_plan">GC Plan</option>
                </>
              ) : (
                <>
                  <option value="gc">Génie civil</option>
                  <option value="installation_poste">
                    Installation poste
                  </option>
                  <option value="installation_campagne">
                    Installation campagne
                  </option>
                  <option value="vt">Vérification technique</option>
                </>
              )}
            </select>
          </Field>
        ) : null}

        {values.document_type === "plan" ? (
          <Field
            label="Statut pour exécution"
            htmlFor="document-execution-status"
            error={fieldErrors.execution_status?.[0]}
          >
            <select
              id="document-execution-status"
              value={values.execution_status}
              onChange={(event) =>
                setValue("execution_status", event.target.value)
              }
              disabled={isSaving}
              className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <option value="pending">En attente de validation</option>
              <option value="approved">Bon pour exécution</option>
              <option value="rejected">Non bon pour exécution</option>
            </select>
          </Field>
        ) : null}

        <Field
          label="Entreprise"
          htmlFor="document-company"
          error={fieldErrors.company?.[0]}
        >
          <Input
            id="document-company"
            value={values.company}
            onChange={(event) => setValue("company", event.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Date du document"
          htmlFor="document-date"
          error={fieldErrors.document_date?.[0]}
        >
          <Input
            id="document-date"
            type="date"
            value={values.document_date}
            onChange={(event) => setValue("document_date", event.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Zone"
          htmlFor="document-zone"
          error={fieldErrors.zone_id?.[0]}
        >
          <select
            id="document-zone"
            value={values.zone_id}
            onChange={(event) => {
              const zoneId = event.target.value;
              setValues((current) => ({
                ...current,
                zone_id: zoneId,
                phase_id:
                  options.phases.find(
                    (phase) => phase.id === current.phase_id,
                  )?.zone_id === zoneId
                    ? current.phase_id
                    : "",
              }));
            }}
            disabled={isSaving || isLoadingOptions}
            className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Aucune zone</option>
            {options.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {optionLabel(zone)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Phase"
          htmlFor="document-phase"
          error={fieldErrors.phase_id?.[0]}
        >
          <select
            id="document-phase"
            value={values.phase_id}
            onChange={(event) => setValue("phase_id", event.target.value)}
            disabled={isSaving || isLoadingOptions}
            className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Aucune phase</option>
            {filteredPhases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {optionLabel(phase)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Activité"
          htmlFor="document-activity"
          error={fieldErrors.activity_id?.[0]}
        >
          <select
            id="document-activity"
            value={values.activity_id}
            onChange={(event) => setValue("activity_id", event.target.value)}
            disabled={isSaving || isLoadingOptions}
            className="h-9 w-full rounded-3xl border bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Aucune activité</option>
            {options.activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {optionLabel(activity)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Commentaires"
        htmlFor="document-comments"
        error={fieldErrors.comments?.[0]}
      >
        <textarea
          id="document-comments"
          value={values.comments}
          onChange={(event) => setValue("comments", event.target.value)}
          disabled={isSaving}
          rows={4}
          className="w-full resize-y rounded-3xl border bg-input/50 px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </Field>

      {children}

      {isLoadingOptions ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Chargement des données du projet…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={isSaving || isLoadingOptions || !canSubmit}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {isSaving ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
