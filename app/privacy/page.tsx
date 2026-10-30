import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · NagarNetra" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        NagarNetra is an open-source civic reporting platform. Citizens report public problems such as potholes,
        garbage, leaks, broken streetlights, electrical hazards and pollution, and the platform works out which
        public authority is responsible. This policy explains what we collect, why, and what is made public.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Google account details</strong> (email address, name, profile picture) when you sign in with
          Google. We use them only to keep your reports linked to your account. They are never shown publicly.
        </li>
        <li>
          <strong>Photos</strong> you take of a civic issue, and optional after-photos showing a fix.
        </li>
        <li>
          <strong>Voice notes</strong> you record to describe an issue, and their text transcripts.
        </li>
        <li>
          <strong>Location</strong>: your device&apos;s GPS reading and accuracy when you report, and any correction
          you make to the pin.
        </li>
        <li>
          <strong>Technical data</strong>: device type (phone, tablet or laptop), time of capture and submission, and
          IP address (used only for rate limiting and abuse prevention).
        </li>
      </ul>

      <h2>What is public and what stays private</h2>
      <p>Public, so that anyone can follow the issue and hold authorities accountable:</p>
      <ul>
        <li>the photo, after faces and vehicle number plates are blurred and photo metadata (EXIF) is removed;</li>
        <li>the issue category, an AI-written summary, severity and status timeline;</li>
        <li>the location of the issue and the area it falls in (local body, ward);</li>
        <li>the responsible authority found, with its sources.</li>
      </ul>
      <p>Private, never shown publicly:</p>
      <ul>
        <li>who reported an issue, and the list or map of your reports;</li>
        <li>your Google email, name and picture;</li>
        <li>your voice recordings and their raw transcripts;</li>
        <li>your device&apos;s exact GPS reading and IP address.</li>
      </ul>
      <p>
        If you choose to join the citizen leaderboard, only your chosen nickname and point total are shown. It is off
        by default.
      </p>

      <h2>How your data is processed</h2>
      <ul>
        <li>
          <strong>AI analysis</strong>: photos and voice notes are sent to Google Gemini and Groq to identify the issue
          and transcribe speech. Free tiers of these services may use submitted content to improve their products.
        </li>
        <li>
          <strong>Location lookups</strong>: the coordinates of an issue (without any personal details) are sent to
          OpenStreetMap services (Overpass, Nominatim), Wikidata and Open-Meteo to find the area, nearby roads and
          places, the responsible authority and the weather.
        </li>
        <li>
          <strong>Storage and hosting</strong>: data is stored with Supabase and the site is hosted on Vercel.
        </li>
        <li>
          <strong>Abuse prevention</strong>: Cloudflare Turnstile checks that a report is sent by a person.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        To identify and locate civic issues, find the responsible authority, merge duplicate reports, prioritise
        hazards, show you the status of your reports, prevent spam and publish accountability statistics. We do not
        sell your data or use it for advertising.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can browse the map, incidents and statistics without signing in.</li>
        <li>You can join or leave the leaderboard at any time.</li>
        <li>
          You can delete your account at any time. This removes your account, Google details, raw photos, voice
          recordings and transcripts. Issues you reported stay public as anonymous records, so reports by other people
          about the same issue are not lost.
        </li>
      </ul>

      <h2>Not an emergency service</h2>
      <p>If anyone is in danger, call 112 immediately. NagarNetra does not alert emergency services.</p>

      <h2>Age</h2>
      <p>NagarNetra is meant for people aged 18 or over, or younger users with a parent or guardian&apos;s consent.</p>

      <h2>Changes and contact</h2>
      <p>
        We will update this page if our practices change. For questions or data requests, contact <Contact />.
      </p>
    </LegalPage>
  );
}
