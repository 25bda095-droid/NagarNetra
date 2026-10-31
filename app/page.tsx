// Home: public map of every incident (no login) and the "Report an issue" entry point.
import { Suspense } from "react";
import Link from "next/link";
import IncidentMap from "@/components/IncidentMap";
import SignInButton from "@/components/SignInButton";
import { getCurrentUser } from "@/lib/guards/auth";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-4 px-4 py-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">NagarNetra</h1>
      <p className="max-w-md text-lg opacity-80">One report. The right authority. Public accountability.</p>

      {/* reads cookies and the URL, so it renders per request; the heading above is prerendered */}
      <Suspense fallback={<p className="text-sm opacity-60">Checking sign-in...</p>}>
        <AuthStatus searchParams={searchParams} />
      </Suspense>

      <Link href="/report" className="rounded-md bg-red-600 px-5 py-2.5 font-medium text-white">
        Report an issue
      </Link>

      <IncidentMap />

      <footer className="mt-8 flex gap-4 text-sm opacity-70">
        <Link href="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms of Use
        </Link>
      </footer>
    </main>
  );
}

async function AuthStatus({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const user = await getCurrentUser();
  const { auth_error } = await searchParams;

  return (
    <>
      {auth_error && <p className="text-sm text-red-600">Sign-in failed. Please try again.</p>}

      {user ? (
        <div className="flex flex-col items-center gap-2 text-sm">
          <p>
            Signed in{user.isModerator ? " as moderator" : ""} ({user.provider ?? "unknown provider"})
          </p>
          <form action="/auth/signout" method="post">
            <button className="rounded-md border px-3 py-1.5">Sign out</button>
          </form>
        </div>
      ) : (
        <SignInButton />
      )}
    </>
  );
}
