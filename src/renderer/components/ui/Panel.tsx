import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  corners?: boolean;
  accent?: "phosphor" | "amber" | "coral" | "violet";
}

const accentBorder: Record<string, string> = {
  phosphor: "border-phosphor-400/25",
  amber: "border-amber-500/30",
  coral: "border-coral/30",
  violet: "border-violet/30",
};

export default function Panel({
  title,
  subtitle,
  right,
  children,
  className,
  bodyClassName,
  corners = false,
  accent = "phosphor",
}: PanelProps) {
  return (
    <section
      className={cn(
        "panel flex flex-col",
        accentBorder[accent],
        corners && "corners",
        className
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-phosphor-400" />
            <div className="min-w-0">
              {title && (
                <h3 className="font-display text-[11px] font-semibold text-ink truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[10px] text-ink-faint data-mono truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </header>
      )}
      <div className={cn("flex-1 min-h-0", bodyClassName)}>{children}</div>
    </section>
  );
}
