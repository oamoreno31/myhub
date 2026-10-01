import { cn } from "@/lib/utils";

/** Isotipo de Plata Clara (moneda con trazo). Hereda el color con `text-*`. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M11 20c1.5 1.4 3 2 5 2 2.6 0 4.5-1.3 4.5-3.3 0-4.4-9-2.2-9-6.6C11.5 10.3 13.3 9 16 9c1.8 0 3.3.6 4.5 1.7M16 6v3M16 22v4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
