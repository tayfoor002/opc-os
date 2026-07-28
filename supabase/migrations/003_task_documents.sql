create table if not exists public.task_documents (
  task_id uuid not null references public.tasks(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, document_id)
);

create index if not exists task_documents_document_id_idx
  on public.task_documents(document_id);

alter table public.task_documents enable row level security;

drop policy if exists "authenticated manage task documents"
  on public.task_documents;

create policy "authenticated manage task documents"
on public.task_documents
for all
to authenticated
using (true)
with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.task_documents;
  exception when duplicate_object then null;
  end;
end $$;
