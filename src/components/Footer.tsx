import { AsciiDivider } from './AsciiDivider';

export function Footer() {
  return (
    <div className="w-full mt-16">
      <AsciiDivider type="double" />
      <div className="flex items-center justify-center space-x-8 py-6">
        <span className="text-foreground">BUILT ON SUI</span>
        <span className="text-accent">│</span>
        <span className="text-foreground">DOCS</span>
        <span className="text-accent">│</span>
        <span className="text-foreground">AUDIT</span>
      </div>
      <div className="text-center pb-6">
        <div className="text-accent text-xs">
          ※ THIS IS A DEMONSTRATION PROJECT
        </div>
      </div>
    </div>
  );
}