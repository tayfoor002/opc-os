# OPC OS V2

## Planning connecté et récupération du compte

Le planning utilise les tâches et activités existantes : Gantt hiérarchique, édition des dates, création de tâches, import avec aperçu et correspondances persistantes, puis enregistrement atomique avec historique. Installer `supabase/migrations/019_connected_schedule.sql` avant d’enregistrer des changements de planning.

Formats d’import : Excel/CSV (première feuille), XML MS Project et PDF texte contenant un libellé suivi de deux dates explicites. Les dates textuelles utilisent JJ/MM/AAAA ou AAAA-MM-JJ. Les PDF scannés, les barres graphiques sans dates et les fichiers binaires `.mpp` ne sont pas reconstruits. Exporter `.mpp` en XML depuis Microsoft Project. Les dépendances et calendriers MS Project ne sont pas recalculés. L’avancement terrain, les responsables et les documents restent conservés lors de l’import des dates.

Le lien « Mot de passe oublié » ouvre `/auth/forgot-password`. Dans Supabase Authentication → URL Configuration, autoriser les URLs de retour utilisées :

- Production : `https://opc-os.vercel.app/auth/callback`
- Local : `http://127.0.0.1:3000/auth/callback`
- Local alternatif : `http://localhost:3000/auth/callback`

Le parcours utilise PKCE : demander le lien et l’ouvrir dans le même navigateur. Le lien reçu ouvre la page de choix du nouveau mot de passe ; aucun mot de passe n’est envoyé par e-mail.

Validation du moteur d’import : `node --test tests/schedule.test.cjs`. Les tests d’intégration `tests/schedule.integration.sql` nécessitent le SQL Editor Supabase ; ils s’exécutent en transaction avec `ROLLBACK` et ne doivent pas être modifiés pour supprimer cette annulation.

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
OPENAI_API_KEY=VOTRE_CLE_OPENAI_COTE_SERVEUR
# Facultatif : modèle de vision haute précision pour les PV manuscrits
OPENAI_OCR_MODEL=gpt-5.5
```

Ne jamais ajouter `.env.local` au dépôt Git.

## Base Supabase

Dans Supabase SQL Editor, exécuter dans l'ordre :

1. `supabase/migrations/001_opc_os_v2.sql`
2. `supabase/seed.sql` (facultatif)

Pour activer l'import, le classement et l'archivage des PV manuscrits sur une
base existante, exécuter également
`supabase/migrations/018_handwritten_meeting_pv.sql`. La clé OpenAI ne doit
jamais être préfixée par `NEXT_PUBLIC_` : elle reste uniquement sur le serveur.

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
