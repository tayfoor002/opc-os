# OPC OS V2

Version applicative de travail basée sur Next.js 16, TypeScript et Supabase.

## Contenu

- Dashboard
- Zones
- Phases (schéma de données)
- Activités
- Documents
- Matériels / Équipements
- Photos et réserves dans la base
- Moteur de relations générique `object_links`
- Migration SQL Supabase
- Données de démonstration

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=VOTRE_CLE_PUBLISHABLE
```

Ne jamais ajouter `.env.local` au dépôt Git.

## Base Supabase

Dans Supabase SQL Editor, exécuter dans l'ordre :

1. `supabase/migrations/001_opc_os_v2.sql`
2. `supabase/seed.sql` (facultatif)

## Architecture métier

```text
Projet
└── Zone
    └── Phase
        └── Activité
            ├── Documents
            ├── Matériels
            ├── Photos
            ├── Réserves
            └── Relations
```

## Important

Ce pack est une base V2 autonome. Il ne remplace pas automatiquement un dépôt existant sans fusion du code et vérification de ses tables actuelles.
