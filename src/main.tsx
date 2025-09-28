
import { createRoot } from "react-dom/client";
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { networkConfig } from './config/sui';
import App from "./App.tsx";
import "./index.css";
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
      <WalletProvider 
        autoConnect={true}
        storageKey="alpine-wallet-connection"
      >
        <App />
      </WalletProvider>
    </SuiClientProvider>
  </QueryClientProvider>
);
