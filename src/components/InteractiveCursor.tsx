import { useState, useEffect } from 'react';

interface MousePosition {
  x: number;
  y: number;
}

export function InteractiveCursor() {
  const [mousePos, setMousePos] = useState<MousePosition>({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => setIsHovering(false);

    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
      heroSection.addEventListener('mousemove', handleMouseMove);
      heroSection.addEventListener('mouseenter', handleMouseEnter);
      heroSection.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (heroSection) {
        heroSection.removeEventListener('mousemove', handleMouseMove);
        heroSection.removeEventListener('mouseenter', handleMouseEnter);
        heroSection.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);

  if (!isHovering) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-300"
      style={{
        left: mousePos.x - 150,
        top: mousePos.y - 150,
        width: '300px',
        height: '300px',
      }}
    >
      {/* Cursor Circle Reveal */}
      <div className="relative w-full h-full">
        {/* Clear Center Circle */}
        <div className="absolute inset-0 rounded-full overflow-hidden bg-background/95 backdrop-blur-sm border border-accent/30">
          {/* Centered Text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-accent font-mono">
              <div className="text-sm leading-tight">
                FIRST<br/>
                DECENTRALIZED<br/>
                CHF<br/>
                STABLE COIN
              </div>
            </div>
          </div>
        </div>
        
        {/* Glitch Ring */}
        <div className="absolute inset-0 rounded-full border-2 border-accent/50 animate-pulse">
          <div className="absolute -inset-1 rounded-full border border-accent/30 animate-ping"></div>
        </div>
      </div>
    </div>
  );
}