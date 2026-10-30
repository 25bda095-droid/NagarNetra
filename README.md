# NagarNetra

**One report. The right authority. Public accountability.**

NagarNetra is an India-wide AI civic triage and accountability platform. A citizen takes a live photo of a civic problem (pothole, garbage, leak, streetlight, dangerous wire, pollution), optionally speaks in any Indian language, and confirms their location. An AI pipeline then:

1. checks the evidence (reused images, GPS accuracy, face and number-plate blurring),
2. understands the issue from the photo and voice note,
3. discovers the jurisdiction live from OpenStreetMap and the official Local Government Directory,
4. scores severity with explicit safety rules,
5. merges duplicate reports into one incident,
6. finds and verifies the responsible authority, with sources.

Nothing about any place is hardcoded: every location fact is discovered live and shown with its source.

> Status: under active development for the Forge Gen AI buildathon.

## Tech stack

- Next.js (App Router, TypeScript), Tailwind CSS
- Supabase: Postgres + PostGIS + pg_trgm, Storage, Auth (Google sign-in), Realtime
- Gemini (photo and voice understanding, with a fallback model)
- OpenStreetMap (Overpass, Nominatim), Wikidata, Local Government Directory (data.gov.in), Open-Meteo
- Hosted on Vercel

## Local setup

Requirements: Node.js 20+, npm, a Supabase project.

```bash
git clone <repo-url>
cd nagarnetra
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open http://localhost:3000.

### Database

The schema lives in `supabase/migrations/` (tables, Row Level Security, public views, storage buckets).

Apply it to your Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Test the migrations and security rules locally (needs Docker; uses a throwaway PostGIS container):

```bash
npm run test:db
```

### Official local government directory

Import every state, district, sub-district, block and local body in India (about 300,000 rows, under a minute):

```bash
npm run import:lgd
```

Re-run it any time to refresh; units removed from the directory are deleted. Sources and licences are listed in [DATA_SOURCES.md](DATA_SOURCES.md).

### Trying the AI analysis

Run the photo / voice-note analysis on your own files without the app (uses `GEMINI_API_KEY` from `.env.local`):

```bash
npm run try:analyze -- photo.jpg [voice.webm] [--note "text"]
```

## Licence

Apache License 2.0, see [LICENSE](LICENSE).

Map data © OpenStreetMap contributors (ODbL).
