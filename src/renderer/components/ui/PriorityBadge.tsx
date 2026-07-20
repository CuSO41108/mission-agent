import { priorityLabel, PRIORITY_COLOR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export default function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { locale } = usePreferences();
  const color = PRIORITY_COLOR[priority] ?? "rgb(var(--phosphor-400))";
  return (
    <span
      className={cn("chip border", className)}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 33%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <span
        className="w-1 h-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      {priorityLabel(priority, locale)}
    </span>
  );
}
