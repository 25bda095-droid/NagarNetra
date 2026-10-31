// Home: what NagarNetra does, how to use it, live public numbers and the incident map (no login).
import Link from "next/link";
import HomeStats from "@/components/HomeStats";
import IncidentMap from "@/components/IncidentMap";
import TrackSearch from "@/components/TrackSearch";

const HOW = [
  { n: "1", t: "Take a live photo", d: "Stand at the problem and photograph it. Add a voice note in any Indian language if you like." },
  { n: "2", t: "Confirm the spot", d: "We read your GPS. Nudge the pin if it's slightly off; you must be at the place." },
  { n: "3", t: "AI does the paperwork", d: "It checks the photo, finds the jurisdiction, scores severity, merges duplicates and finds who is responsible, with sources." },
  { n: "4", t: "Track it publicly", d: "You get a tracking code. Forward it, add the ticket ID, and verify the fix with an after-photo." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:py-12">
      <section className="nn-rise grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <span className="chip w-fit border-brand/30 bg-brand-soft text-brand">Live across India · every fact sourced</span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            One report.<br />The right authority.<br /><span className="text-brand">Public accountability.</span>
          </h1>
          <p className="max-w-lg text-muted">
            Spot a pothole, garbage dump, broken streetlight or dangerous wire? Report it in under a minute. NagarNetra works out who must fix it and keeps the progress public.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/report" className="btn-primary px-6 text-base">Report an issue</Link>
            <a href="#map" className="btn-ghost">See the live map</a>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Already reported? Track it</span>
            <TrackSearch />
          </div>
        </div>
        <div className="card flex flex-col gap-3">
          <span className="eyebrow">Live impact</span>
          <HomeStats />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((s) => (
            <li key={s.n} className="card flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{s.n}</span>
              <h3 className="font-medium">{s.t}</h3>
              <p className="text-sm text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="map" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Live incident map</h2>
          <Link href="/stats" className="text-sm text-brand">Stats & leaderboards →</Link>
        </div>
        <IncidentMap />
      </section>

      <section className="card grid gap-4 text-sm sm:grid-cols-3">
        <div><h3 className="font-medium">Danger to life?</h3><p className="text-muted">Call <a href="tel:112" className="font-medium text-danger">112</a> first. Then report here so it gets fixed for good.</p></div>
        <div><h3 className="font-medium">Your privacy</h3><p className="text-muted">Faces and number plates are blurred. Your name, email and exact location are never public.</p></div>
        <div><h3 className="font-medium">Open data</h3><p className="text-muted">Built on OpenStreetMap, the Local Government Directory and Wikidata. <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p></div>
      </section>
    </main>
  );
}
