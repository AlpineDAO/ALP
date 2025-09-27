import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

export function Header() {
  const account = useCurrentAccount();

  return (
    <div className="w-full">
      <nav className="flex items-center justify-between py-6 px-8">
        <div className="text-foreground">
          SUISTABLE
        </div>
        <div className="flex items-center space-x-8">
          <span className="text-foreground">ABOUT</span>
          <span className="text-accent">│</span>
          <span className="text-foreground">DOCS</span>
          <span className="text-accent">│</span>
          <div className="flex items-center space-x-4">
            <ConnectButton />
          </div>
        </div>
      </nav>
      <div className="w-full h-px bg-accent flex items-center justify-center">
        <span className="text-accent bg-background px-2">═══════════════════════════════════════════════</span>
      </div>
    </div>
  );
}