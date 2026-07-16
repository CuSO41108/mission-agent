interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  showLabel?: boolean;
  segments?: { value: number; color: string }[];
}

export default function ProgressRing({
  progress,
  size = 120,
  stroke = 8,
  color = "#00E5D4",
  trackColor = "rgba(255,255,255,0.06)",
  showLabel = true,
  segments,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;

  // 多段模式：用于分舱细分
  let segmentEls = null;
  if (segments && segments.length) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let acc = 0;
    segmentEls = segments.map((seg, i) => {
      const len = (seg.value / total) * c;
      const dash = `${len - 2} ${c - len + 2}`;
      const el = (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={stroke}
          strokeDasharray={dash}
          strokeDashoffset={-acc}
          strokeLinecap="butt"
          style={{ filter: `drop-shadow(0 0 4px ${seg.color}66)` }}
        />
      );
      acc += len;
      return el;
    });
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {segmentEls ? (
          segmentEls
        ) : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color}88)`,
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        )}
        {/* 刻度装饰 */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * 2 * Math.PI;
          const x1 = size / 2 + (r - stroke / 2 - 4) * Math.cos(a);
          const y1 = size / 2 + (r - stroke / 2 - 4) * Math.sin(a);
          const x2 = size / 2 + (r - stroke / 2 - 2) * Math.cos(a);
          const y2 = size / 2 + (r - stroke / 2 - 2) * Math.sin(a);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={i % 5 === 0 ? 1 : 0.5}
            />
          );
        })}
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-display font-bold text-glow-phosphor data-mono"
            style={{ fontSize: size * 0.22, color }}
          >
            {progress}
            <span className="text-[0.5em]">%</span>
          </span>
        </div>
      )}
    </div>
  );
}
