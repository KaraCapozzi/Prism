import type { RunSummary } from "@/lib/types";

const STYLES: Record<RunSummary["status"], string> = {
  pass: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  fail: "bg-rose-500/10 text-rose-400 ring-rose-500/30",
};

const LABELS: Record<RunSummary["status"], string> = {
  pass: "Pass",
  warning: "Contested",
  fail: "Fail",
};

export function StatusBadge({ status }: { status: RunSummary["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}

export function scoreStatus(score: number): RunSummary["status"] {
  if (score >= 80) return "pass";
  if (score >= 55) return "warning";
  return "fail";
}

export function scoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 55) return "text-amber-400";
  return "text-rose-400";
}
