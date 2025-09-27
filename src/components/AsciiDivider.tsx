interface AsciiDividerProps {
  type?: 'single' | 'double' | 'dotted';
  className?: string;
}

export function AsciiDivider({ type = 'single', className = '' }: AsciiDividerProps) {
  const symbols = {
    single: '─────────────────────────────────────────────────────',
    double: '═════════════════════════════════════════════════════',
    dotted: '◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦◦'
  };

  return (
    <div className={`w-full flex justify-center py-8 ${className}`}>
      <div className="text-accent text-sm font-mono">
        {symbols[type]}
      </div>
    </div>
  );
}