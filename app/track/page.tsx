import TrackSearch from "@/components/TrackSearch";
import { Tip } from "@/components/ui";

export default function TrackHome() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Track a report</h1>
      <p className="text-muted">Enter the tracking code you got after reporting. Anyone with the code can see the status, no login needed.</p>
      <TrackSearch />
      <Tip>Signed in? <a href="/me" className="underline">My reports</a> lists every report you made, on any device.</Tip>
    </main>
  );
}
