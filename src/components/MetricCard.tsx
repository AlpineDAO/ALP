interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  indicator?: '▲' | '▼' | '◦';
}

export function MetricCard({ title, value, change, indicator }: MetricCardProps) {
  return (
    <div className="border border-accent bg-card p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-accent">◊</span>
        <span className="text-accent">◊</span>
      </div>
      <div className="space-y-2">
        <div className="text-foreground text-xs tracking-wider">
          {title}
        </div>
        <div className="text-foreground text-xl">
          {value}
        </div>
        {change && (
          <div className="flex items-center space-x-2">
            <span className="text-accent">{indicator}</span>
            <span className="text-foreground text-sm">{change}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-accent">◊</span>
        <span className="text-accent">◊</span>
      </div>
    </div>
  );
}