# OPC OS v0.10.3

1. `npm.cmd install`
2. Copy `.env.example` to `.env.local` and fill Supabase URL/key.
3. Run `supabase/setup.sql` in Supabase SQL Editor.
4. Create a user in Supabase Authentication > Users.
5. `npm.cmd run dev`


## Sprint 007 additions

- Splash screen appears once per browser session
- About page available from sidebar
- Copyright on login and sidebar
- Smaller Alstom logo
- Version and professional signature visible


## Sprint 008

The login screen now matches the validated blue/white Alstom-inspired interface.
The copyright and professional signature are visible directly on the login screen.


## Sprint 009 setup

The `.env.local` file is already included.
Run `supabase/sprint_009_activities.sql` once in Supabase SQL Editor.
Then run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `/activities` or click Activities in the sidebar.


## Sprint 010
Aucune migration SQL.


## 0.10.1
Professional rail engineering login illustration; no SQL migration required.


## 0.10.2
Minimalist login background; no SQL migration required.


## 0.10.3
Approved blueprint login background integrated. No SQL migration required.

## Sprint 012 — Tasks Control Center

1. Open Supabase > SQL Editor.
2. Run `supabase/sprint_012_tasks.sql` once.
3. Restart the app with `npm run dev`.
4. Open `/tasks` or click **Tasks** in the sidebar.

Included:
- task CRUD;
- owner, deadline, priority and status;
- links between Tasks and Activities;
- overdue detection and KPI cards;
- filters by status, owner and activity;
- realtime refresh through Supabase;
- task count visible in Activities.
