interface DataRow {
  metric: string;
  value: string;
  change: string;
  indicator: '▲' | '▼' | '◦';
}

interface DataTableProps {
  data: DataRow[];
}

export function DataTable({ data }: DataTableProps) {
  return (
    <div className="border border-accent bg-card">
      {/* Header */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-accent">
        <div className="text-foreground text-xs tracking-wider">METRIC</div>
        <div className="text-foreground text-xs tracking-wider text-center">VALUE</div>
        <div className="text-foreground text-xs tracking-wider text-center">24H CHANGE</div>
        <div className="text-foreground text-xs tracking-wider text-center">STATUS</div>
      </div>
      
      {/* Separator */}
      <div className="px-4 py-1 bg-secondary">
        <div className="text-accent text-sm">════════════╪════════════╪═════════════╪══════════</div>
      </div>
      
      {/* Data Rows */}
      {data.map((row, index) => (
        <div key={index} className="grid grid-cols-4 gap-4 p-4 border-b border-accent last:border-b-0">
          <div className="text-foreground">{row.metric}</div>
          <div className="text-foreground text-center">{row.value}</div>
          <div className="text-foreground text-center">{row.change}</div>
          <div className="text-center">
            <span className="text-accent">{row.indicator}</span>
          </div>
        </div>
      ))}
    </div>
  );
}