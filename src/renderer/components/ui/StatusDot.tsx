import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "connected" | "disconnected" | "error" | "beta" | "active" | "paused" | "done" | "archived";
  className?: string;
  pulse?: boolean;
}

const COLOR: Record<string, string> = {
  connected: "#00E5D4",
  active: "#00E5D4",
  done: "#7FD1B9",
  disconnected: "#5C6773",
  paused: "#FFB547",
  error: "#FF6B6B",
  beta: "#9D8CFF",
  archived: "#5C6773",
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
        style={{
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </span>
  );
}
