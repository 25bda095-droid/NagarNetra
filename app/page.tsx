// Placeholder home page for B0: proves the app builds and deploys over HTTPS.
// The real map and "Report an issue" flow replace this in later steps.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">NagarNetra</h1>
      <p className="max-w-md text-lg opacity-80">
        One report. The right authority. Public accountability.
      </p>
      <p className="text-sm opacity-60">
        AI civic triage for every location in India. Under construction.
      </p>
    </main>
  );
}
