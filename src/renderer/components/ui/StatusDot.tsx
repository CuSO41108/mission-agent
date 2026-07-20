import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "connected" | "disconnected" | "error" | "beta" | "active" | "paused" | "done" | "archived";
  className?: string;
  pulse?: boolean;
}

const COLOR: Record<string, string> = {
  connected: "rgb(var(--phosphor-400))",
  active: "rgb(var(--phosphor-400))",
  done: "rgb(var(--jade))",
  disconnected: "rgb(var(--ink-faint))",
  paused: "rgb(var(--amber-500))",
  error: "rgb(var(--coral))",
  beta: "rgb(var(--violet))",
  archived: "rgb(var(--ink-faint))",
};

export default function StatusDot({ status, className, pulse = false }: StatusDotProps) {
  const color = COLOR[status] ?? "#5C6773";
  const shouldPulse = pulse && (status === "connected" || status === "active" || status === "error");
  return (
    <span className={cn("relative inline-flex w-2 h-2", className)}>
      {shouldPulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ backgroundColor: color, opacity: 0.6 }}
        />
      )}
      <span
        className="relative inline-flex w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}
