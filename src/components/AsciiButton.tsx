interface AsciiButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  className?: string;
}

export function AsciiButton({ children, variant = 'primary', onClick, className = '' }: AsciiButtonProps) {
  const baseStyles = "px-6 py-3 border border-accent bg-card text-foreground hover:bg-secondary transition-colors cursor-pointer inline-block";
  
  return (
    <div className={`${baseStyles} ${className}`} onClick={onClick}>
      <div className="flex items-center">
        <span className="text-accent mr-2">┌─</span>
        <span className="px-2">{children}</span>
        <span className="text-accent ml-2">─┐</span>
      </div>
    </div>
  );
}