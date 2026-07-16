import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export default function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const color = PRIORITY_COLOR[priority] ?? "#00E5D4";
  return (
    <span
      className={cn("chip border", className)}
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}10`,
      }}
    >
      <span
        className="w-1 h-1 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}
