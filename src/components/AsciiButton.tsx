interface AsciiButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'white';
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function AsciiButton({ children, variant = 'primary', onClick, className = '', disabled = false }: AsciiButtonProps) {
  const getVariantStyles = () => {
    const baseStyles = "px-6 py-3 border transition-colors inline-block";
    const disabledStyles = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";

    switch (variant) {
      case 'white':
        return `${baseStyles} border-white bg-white text-background ${disabled ? '' : 'hover:bg-accent hover:text-foreground'} ${disabledStyles}`;
      case 'secondary':
        return `${baseStyles} border-accent bg-background text-accent ${disabled ? '' : 'hover:bg-accent hover:text-background'} ${disabledStyles}`;
      default:
        return `${baseStyles} border-accent bg-card text-foreground ${disabled ? '' : 'hover:bg-secondary'} ${disabledStyles}`;
    }
  };
  
  const getBorderColor = () => {
    switch (variant) {
      case 'white':
        return "text-background";
      default:
        return "text-accent";
    }
  };
  
  return (
    <div
      className={`${getVariantStyles()} ${className} glitch-disable-zone`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-center">
        <span className={`${getBorderColor()} mr-2`}>┌─</span>
        <span className="px-2">{children}</span>
        <span className={`${getBorderColor()} ml-2`}>─┐</span>
      </div>
    </div>
  );
}