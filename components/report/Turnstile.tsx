"use client";

// Cloudflare Turnstile widget (anti-bot) for Submit. Renders nothing when no site key is set (local dev).
import { useEffect, useRef } from "react";

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function Turnstile({ onToken }: { onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | null = null;
    const render = () => {
      const ts = (window as unknown as { turnstile?: TS }).turnstile;
      if (!ts || !box.current || id) return;
      id = ts.render(box.current, { sitekey: SITE_KEY, callback: onToken, "expired-callback": () => onToken(null), "error-callback": () => onToken(null) });
    };
    if (!document.getElementById("cf-turnstile")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    const t = setInterval(render, 300);
    return () => {
      clearInterval(t);
      if (id) (window as unknown as { turnstile?: TS }).turnstile?.remove(id);
    };
  }, [onToken]);
  return SITE_KEY ? <div ref={box} /> : null;
}
