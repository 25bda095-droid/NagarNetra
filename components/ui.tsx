// Small shared UI pieces: badges for severity/status and an incident status stepper.
const SEV: Record<string, string> = {
  critical: "border-danger/30 bg-danger/10 text-danger",
  high: "border-warn/30 bg-warn/10 text-warn",
  medium: "border-info/30 bg-info/10 text-info",
  low: "border-ok/30 bg-ok/10 text-ok",
};
export const SEV_COLOR: Record<string, string> = { critical: "#dc2626", high: "#ea580c", medium: "#2563eb", low: "#16a34a" };

export function SeverityBadge({ band, score }: { band?: string | null; score?: number | null }) {
  if (!band) return null;
  return <span className={`chip ${SEV[band] ?? ""}`}>{band[0].toUpperCase() + band.slice(1)}{score != null && ` · ${score}`}</span>;
}

const STEPS = [
  { key: "open", label: "Reported" },
  { key: "forwarded", label: "Forwarded" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved_claimed", label: "Fixed (claimed)" },
  { key: "resolved_verified", label: "Fixed (verified)" },
];

export function StatusLabel({ status }: { status: string }) {
  const s = status === "reopened" ? "Reopened" : STEPS.find((x) => x.key === status)?.label ?? status;
  const tone = status === "resolved_verified" ? "border-ok/30 bg-ok/10 text-ok" : status === "reopened" ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-surface-2 text-muted";
  return <span className={`chip ${tone}`}>{s}</span>;
}

export function StatusStepper({ status }: { status: string }) {
  const at = status === "reopened" ? 0 : Math.max(0, STEPS.findIndex((s) => s.key === status));
  return (
    <ol className="grid grid-cols-5 gap-1">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-col gap-1.5">
          <span className={`h-1.5 rounded-full ${i <= at ? (status === "resolved_verified" ? "bg-ok" : "bg-brand") : "bg-surface-2"}`} />
          <span className={`text-[10px] leading-tight sm:text-xs ${i <= at ? "text-ink" : "text-muted"}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs text-ink">
      <span aria-hidden className="font-bold text-brand">i</span>
      <span>{children}</span>
    </p>
  );
}
