insert into projects (name, code, description)
values ('Projet OPC Démo', 'OPC-DEMO', 'Projet initial OPC OS V2')
on conflict (code) do nothing;

with p as (
  select id from projects where code = 'OPC-DEMO'
)
insert into zones (project_id, name, code, position)
select p.id, z.name, z.code, z.position
from p
cross join (values
  ('Zone A','ZA',1),
  ('Zone B','ZB',2),
  ('Zone C','ZC',3),
  ('Zone D','ZD',4)
) as z(name, code, position)
on conflict (project_id, name) do nothing;

insert into phases (zone_id, name, code, position)
select z.id, p.name, p.code, p.position
from zones z
cross join (values
  ('Phase 1','P1',1),
  ('Phase 2','P2',2),
  ('Phase 3','P3',3)
) as p(name, code, position)
where not exists (
  select 1 from phases ph where ph.zone_id = z.id and ph.name = p.name
);
