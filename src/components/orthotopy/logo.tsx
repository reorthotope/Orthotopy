import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="2" y="2" width="60" height="60" rx="16" fill="#0b120e" />
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="16"
          fill="none"
          stroke="#34d399"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        <circle cx="32" cy="33" r="13" fill="none" stroke="#34d399" strokeWidth="6.5" />
        <circle cx="47.5" cy="16.5" r="5.5" fill="#6ee7b7" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Orthotopy</span>
    </span>
  );
}
