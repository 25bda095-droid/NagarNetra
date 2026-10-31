import { Suspense } from "react";
import TrackView from "@/components/TrackView";

// params are request data, so they're read inside Suspense (Cache Components)
export default function IncidentPage({ params }: PageProps<"/incident/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <Suspense fallback={<p className="opacity-60">Loading...</p>}>
        <View params={params} />
      </Suspense>
    </main>
  );
}

async function View({ params }: Pick<PageProps<"/incident/[id]">, "params">) {
  const { id } = await params;
  return <TrackView incidentId={id} />;
}
