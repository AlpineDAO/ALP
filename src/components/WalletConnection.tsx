import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { AsciiButton } from './AsciiButton';
import { formatAmount } from '../config/sui';
import { useALP } from '../hooks/useALP';

export const WalletConnection = () => {
    const currentAccount = useCurrentAccount();
    const { alpBalance, suiBalance } = useALP();

    if (!currentAccount) {
        return (
            <>
                <ConnectButton
                    connectText="Connect Wallet"
                    className="font-mono bg-accent text-background px-6 py-2 hover:bg-accent/80 transition-colors"
                />
            </>
        );
    }

    return (
        <>
            <ConnectButton
                connectText="Disconnect"
                className="font-mono bg-accent/20 text-accent px-4 py-2 hover:bg-accent/30 transition-colors text-sm"
            />
        </>
    );
};
