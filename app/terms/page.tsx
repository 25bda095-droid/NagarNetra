import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use · NagarNetra" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>By using NagarNetra you agree to these terms.</p>

      <h2>What NagarNetra is</h2>
      <p>
        NagarNetra helps citizens report public civic problems and finds the authority that is likely responsible. It
        is an independent open-source project. It is <strong>not</strong> a government service, it does not submit
        complaints to authorities on your behalf, and it is <strong>not an emergency service</strong>: if anyone is in
        danger, call 112.
      </p>

      <h2>Your reports</h2>
      <ul>
        <li>Report only real, public civic issues that you have seen yourself.</li>
        <li>Do not upload photos of people as the subject, private property interiors, or anything unlawful.</li>
        <li>Do not submit false, duplicate-on-purpose, abusive or spam reports.</li>
        <li>
          You allow us to publish the blurred photo, category, summary and location of your report, as described in the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </li>
      </ul>

      <h2>AI and accuracy</h2>
      <p>
        Issue types, severity and responsible authorities are worked out automatically using AI and public data
        sources, and may be wrong. Every authority is shown with its sources and a confidence level so you can check
        it. Always confirm details on the official channel before relying on them.
      </p>

      <h2>Moderation</h2>
      <p>
        We may hide reports or limit accounts that break these terms. Reports are never silently deleted for being
        inconvenient to any authority.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided as is, without guarantees of availability or accuracy. The source code is available
        under the Apache License 2.0.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <Contact />.
      </p>
    </LegalPage>
  );
}
