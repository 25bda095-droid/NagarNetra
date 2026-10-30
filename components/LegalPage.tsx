// Shared layout for the Privacy Policy and Terms pages.
import Link from "next/link";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
export const LAST_UPDATED = "31 October 2026";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-3 [&_ul]:my-3">
      <Link href="/" className="text-sm opacity-70 hover:underline">
        ← NagarNetra
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm opacity-60">Last updated: {LAST_UPDATED}</p>
      {children}
    </main>
  );
}

export function Contact() {
  return CONTACT_EMAIL ? (
    <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span>the contact address listed on the project&apos;s GitHub page</span>
  );
}
