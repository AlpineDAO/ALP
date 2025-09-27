interface AsciiButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'white';
  onClick?: () => void;
  className?: string;
}

export function AsciiButton({ children, variant = 'primary', onClick, className = '' }: AsciiButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'white':
        return "px-6 py-3 border border-white bg-white text-background hover:bg-accent hover:text-foreground transition-colors cursor-pointer inline-block";
      case 'secondary':
        return "px-6 py-3 border border-accent bg-background text-accent hover:bg-accent hover:text-background transition-colors cursor-pointer inline-block";
      default:
        return "px-6 py-3 border border-accent bg-card text-foreground hover:bg-secondary transition-colors cursor-pointer inline-block";
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
    <div className={`${getVariantStyles()} ${className} glitch-disable-zone`} onClick={onClick}>
      <div className="flex items-center">
        <span className={`${getBorderColor()} mr-2`}>┌─</span>
        <span className="px-2">{children}</span>
        <span className={`${getBorderColor()} ml-2`}>─┐</span>
      </div>
    </div>
  );
}