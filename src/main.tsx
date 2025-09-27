
  import { createRoot } from "react-dom/client";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
  import { getFullnodeUrl } from "@mysten/sui.js/client";
  import "@mysten/dapp-kit/dist/index.css";
  import App from "./App.tsx";
  import "./index.css";

  const queryClient = new QueryClient();
  const networks = {
    devnet: { url: getFullnodeUrl("devnet") },
    testnet: { url: getFullnodeUrl("testnet") },
    mainnet: { url: getFullnodeUrl("mainnet") },
  };

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
  