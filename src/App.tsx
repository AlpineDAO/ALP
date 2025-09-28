import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { AsciiButton } from "./components/AsciiButton";
import { MetricCard } from "./components/MetricCard";
import { DataTable } from "./components/DataTable";
import { AsciiDivider } from "./components/AsciiDivider";
import { Footer } from "./components/Footer";
import { GlitchAsciiBackground } from "./components/GlitchAsciiBackground";
import { WalletConnection } from "./components/WalletConnection";
import { useALP } from "./hooks/useALP";
import { useOracle } from "./hooks/useOracle";
import { formatAmount, parseAmount, CONTRACT_ADDRESSES } from "./config/sui";
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const metricsData = [
  {
    metric: "Peg Stability",
    value: "99.98%",
    change: "0.01%",
    indicator: "▲" as const,
  },
  {
    metric: "Total Supply",
    value: "1.2M",
    change: "0.5%",
    indicator: "▼" as const,
  },
  {
    metric: "Collateral Ratio",
    value: "125%",
    change: "0.0%",
    indicator: "◦" as const,
  },
  {
    metric: "Daily Volume",
    value: "45.2K",
    change: "2.1%",
    indicator: "▲" as const,
  },
];

export default function App() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const {
    protocolState,
    userPositions,
    alpBalance,
    suiBalance,
    loading,
    error,
    createPosition,
    addCollateral,
    mintAlp,
    burnAlp,
    refreshData,
  } = useALP();

  // Shared state for collateral amount and selection
  const [selectedCollateral, setSelectedCollateral] = useState<"BTC" | "SUI">("SUI");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [alpAmount, setAlpAmount] = useState("");
  const [isAddingCollateral, setIsAddingCollateral] = useState(false);

  // State for address lookup
  const [lookupAddress, setLookupAddress] = useState("");
  const [lookupResults, setLookupResults] = useState<any[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Function to check collateral for any address
  const checkAddressCollateral = async (address: string) => {
    if (!suiClient) {
      throw new Error("Sui client not available");
    }

    // Validate address format
    if (!address.startsWith("0x") || address.length !== 66) {
      throw new Error("Invalid address format. Address should be 66 characters long and start with 0x");
    }

    setIsLookingUp(true);
    setLookupResults([]);

    try {
      console.log("Checking collateral for address:", address);

      // Query for CollateralPosition objects owned by the specified address
      const response = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::CollateralPosition`,
        },
        options: { showContent: true },
      });

      console.log("Lookup response:", response);

      const positions: any[] = [];
      for (const obj of response.data) {
        if (obj.data?.content && "fields" in obj.data.content) {
          const fields = obj.data.content.fields as any;
          const collateralAmount = BigInt(fields.collateral_amount);
          const alpMinted = BigInt(fields.alp_minted);

          // Calculate collateral ratio (simplified)
          const collateralRatio = alpMinted > 0n
            ? (Number(collateralAmount) / Number(alpMinted)) * 100
            : 0;

          positions.push({
            id: obj.data.objectId,
            owner: fields.owner,
            collateralAmount: formatAmount(collateralAmount),
            alpMinted: formatAmount(alpMinted),
            collateralType: fields.collateral_type,
            lastUpdate: new Date(Number(fields.last_update)).toLocaleString(),
            accumulatedFee: formatAmount(BigInt(fields.accumulated_fee)),
            collateralRatio: collateralRatio.toFixed(2),
          });
        }
      }

      setLookupResults(positions);
      return positions;
    } catch (err) {
      console.error("Error checking address collateral:", err);
      throw new Error(`Failed to check collateral: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Direct function to add collateral using Sui SDK
  const addCollateralDirect = async (positionId: string, amount: string) => {
    if (!currentAccount?.address || !suiClient) {
      throw new Error("Wallet not connected");
    }

    setIsAddingCollateral(true);
    try {
      // Create transaction
      const tx = new Transaction();

      // Get SUI coins for collateral
      const suiCoins = await suiClient.getCoins({
        owner: currentAccount.address,
        coinType: "0x2::sui::SUI",
      });

      if (suiCoins.data.length === 0) {
        throw new Error("No SUI coins available");
      }

      const amountParsed = parseAmount(amount);

      // Split the exact amount from the coin
      const [collateralCoin] = tx.splitCoins(tx.object(suiCoins.data[0].coinObjectId), [amountParsed]);

      // Call add_collateral with the exact amount
      tx.moveCall({
        target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::add_collateral`,
        typeArguments: ["0x2::sui::SUI"],
        arguments: [
          tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
          tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
          tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
          tx.object(positionId),
          collateralCoin,
        ],
      });

      // Execute transaction
      return new Promise((resolve, reject) => {
        signAndExecuteTransaction(
          { transaction: tx },
          {
            onSuccess: (result) => {
              console.log("Collateral added successfully:", result);
              refreshData(); // Refresh the data
              resolve(result);
            },
            onError: (error) => {
              console.error("Error adding collateral:", error);
              reject(error);
            },
          }
        );
      });
    } finally {
      setIsAddingCollateral(false);
    }
  };

  // Oracle hook for real-time price data
  const {
    prices,
    loading: oracleLoading,
    error: oracleError,
    calculateCollateralValueUsd,
    calculateAlpDebtUsd,
    getSuiPriceUsd,
    getChfToUsdRate,
  } = useOracle();

  // Calculate total deposited value from user positions using real oracle prices
  const totalDepositedValue = userPositions.reduce((total, position) => {
    // Use real oracle price data
    const usdValue = calculateCollateralValueUsd(position.collateralAmount, position.collateralType);
    return total + usdValue;
  }, 0);

  // Calculate total ALP debt in USD using real CHF/USD rate
  const totalAlpDebt = userPositions.reduce((total, position) => {
    const alpAmount = Number(position.alpMinted) / 1_000_000_000; // Convert from lamports to ALP
    return total + alpAmount;
  }, 0);

  // Calculate total ALP debt in USD
  const totalAlpDebtUsd = userPositions.reduce((total, position) => {
    const debtUsd = calculateAlpDebtUsd(position.alpMinted);
    return total + debtUsd;
  }, 0);

  // Calculate overall health factor using real oracle prices
  const calculateHealthFactor = () => {
    if (userPositions.length === 0 || totalAlpDebtUsd === 0) return 2.0;

    // Health Factor = (Collateral Value USD * Liquidation Threshold) / ALP Debt USD
    // Both values are now calculated using real oracle prices
    const liquidationThreshold = 0.80; // 80% liquidation threshold (120% collateral ratio)

    const healthFactor = (totalDepositedValue * liquidationThreshold) / totalAlpDebtUsd;

    return healthFactor;
  };

  // Calculate total SUI collateral supplied by the user (from contract)
  const calculateSuiCollateralSupplied = async () => {
    if (!currentAccount?.address || !suiClient) return 0;

    try {
      // Get real SUI balance from wallet
      const suiCoins = await suiClient.getCoins({
        owner: currentAccount.address,
        coinType: "0x2::sui::SUI",
      });

      // Calculate total available SUI balance
      const totalAvailableSui = suiCoins.data.reduce((total, coin) => {
        return total + Number(coin.balance);
      }, 0);

      // Get collateral locked in positions (from contract)
      const totalLockedCollateral = userPositions.reduce((total, position) => {
        // Only count SUI collateral positions
        if (position.collateralType === "0x2::sui::SUI") {
          return total + Number(formatAmount(position.collateralAmount));
        }
        return total;
      }, 0);

      return {
        available: Number(formatAmount(BigInt(totalAvailableSui))),
        locked: totalLockedCollateral,
        total: Number(formatAmount(BigInt(totalAvailableSui))) + totalLockedCollateral
      };
    } catch (error) {
      console.error("Error calculating SUI collateral:", error);
      // Fallback to existing calculation
      const totalSuiCollateral = userPositions.reduce((total, position) => {
        if (position.collateralType === "0x2::sui::SUI") {
          return total + Number(formatAmount(position.collateralAmount));
        }
        return total;
      }, 0);
      
      return {
        available: Number(formatAmount(suiBalance)),
        locked: totalSuiCollateral,
        total: Number(formatAmount(suiBalance)) + totalSuiCollateral
      };
    }
  };

  // Calculate total SUI holdings (available + collateral) - synchronous version for UI
  const calculateTotalSuiHoldings = () => {
    const availableSui = Number(formatAmount(suiBalance));
    const suppliedSui = userPositions.reduce((total, position) => {
      if (position.collateralType === "0x2::sui::SUI") {
        return total + Number(formatAmount(position.collateralAmount));
      }
      return total;
    }, 0);
    
    return {
      available: availableSui,
      supplied: suppliedSui,
      total: availableSui + suppliedSui
    };
  };

  const healthFactor = calculateHealthFactor();
  const suiHoldings = calculateTotalSuiHoldings();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      {/* Hero Section with Interactive ASCII Background */}
      <section className="hero-section relative overflow-hidden h-screen cursor-none">
        <GlitchAsciiBackground />
        <main className="relative z-10 max-w-6xl mx-auto px-8 py-32 h-screen flex items-center justify-center">
          <div className="text-center text-accent font-mono">
            <div className="text-lg opacity-50">
              ═══════════════════════════════════════════════
            </div>
            <div className="text-4xl mt-8 text-white tracking-[0.3em]">
              A L P I N E
            </div>
            <div className="text-sm mt-4 opacity-75 text-white tracking-wide">
              THE FIRST DECENTRALIZED CHF STABLE COIN
            </div>
            <div className="text-lg mt-8 opacity-50">
              ═══════════════════════════════════════════════
            </div>
            <div className="mt-16 cursor-auto">
              <AsciiButton
                variant="white"
                onClick={() => console.log("Mint ALPs clicked")}
              >
                MINT ALPs
              </AsciiButton>
            </div>
          </div>
        </main>
      </section>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-8 py-16 mb-[-100px]">
        <div className="space-y-16">
          <AsciiDivider type="double" />

          {/* Portfolio Overview */}
          <section className="text-center space-y-4 mt-[0px] mr-[0px] mb-[30px] ml-[0px]">
            <div className="flex items-center justify-center gap-4">
              <div className="text-accent text-sm font-mono mt-[-70px] mr-[0px] mb-[16px] ml-[0px]">
                DEPOSITED VALUE
              </div>
              {currentAccount && (
                <button
                  onClick={refreshData}
                  disabled={loading}
                  className="text-accent text-xs font-mono hover:text-white transition-colors disabled:opacity-50 mt-[-70px] mr-[0px] mb-[16px] ml-[0px]"
                >
                  [REFRESH]
                </button>
              )}
            </div>
            {loading ? (
              <div className="text-white text-2xl font-mono tracking-wider">
                LOADING...
              </div>
            ) : error ? (
              <div className="text-red-400 text-lg font-mono tracking-wider">
                ERROR
              </div>
            ) : (
              <div className="text-white text-2xl font-mono tracking-wider">
                {totalDepositedValue.toFixed(2)}
              </div>
            )}
            <div className="text-accent text-xs font-mono">
              USD {prices.sui?.isStale && (
                <span className="text-yellow-400">[STALE PRICE]</span>
              )}
            </div>
            {!loading && !error && userPositions.length > 0 && (
              <div className="text-accent text-xs font-mono mt-2">
                ({userPositions.length} position{userPositions.length > 1 ? 's' : ''})
              </div>
            )}
            {error && (
              <div className="text-red-400 text-xs font-mono mt-2">
                {error}
              </div>
            )}
          </section>

          {/* ALP Debt Display */}
          {!loading && !error && userPositions.length > 0 && (
            <section className="text-center space-y-2">
              <div className="text-accent text-sm font-mono">
                ALP DEBT
              </div>
              <div className="text-white text-xl font-mono tracking-wider">
                {totalAlpDebt.toFixed(2)}
              </div>
              <div className="text-accent text-xs font-mono">
                ALP (≈ ${totalAlpDebtUsd.toFixed(2)} USD)
                {prices.chf?.isStale && (
                  <span className="text-yellow-400 ml-1">[STALE]</span>
                )}
              </div>
            </section>
          )}

          {/* No Positions Message */}
          {userPositions.length === 0 && currentAccount && !loading && (
            <section className="text-center space-y-4">
              <div className="text-accent text-sm font-mono">
                NO POSITIONS FOUND
              </div>
              <div className="text-foreground text-xs">
                Create a position to see your deposited value and ALP debt
              </div>
            </section>
          )}

          {/* Oracle Price Information */}
          {currentAccount && (
            <section className="text-center space-y-4 max-w-2xl mx-auto">
              <div className="text-accent text-sm font-mono">
                ORACLE PRICES
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-accent p-3 bg-card">
                  <div className="text-accent text-xs font-mono mb-1">SUI/USD</div>
                  <div className="text-white text-lg font-mono">
                    ${getSuiPriceUsd().toFixed(3)}
                  </div>
                  <div className="text-accent text-xs font-mono">
                    {prices.sui?.isStale ? (
                      <span className="text-yellow-400">[STALE]</span>
                    ) : (
                      <span className="text-green-400">[LIVE]</span>
                    )}
                  </div>
                </div>
                <div className="border border-accent p-3 bg-card">
                  <div className="text-accent text-xs font-mono mb-1">CHF/USD</div>
                  <div className="text-white text-lg font-mono">
                    ${getChfToUsdRate().toFixed(3)}
                  </div>
                  <div className="text-accent text-xs font-mono">
                    {prices.chf?.isStale ? (
                      <span className="text-yellow-400">[STALE]</span>
                    ) : (
                      <span className="text-green-400">[LIVE]</span>
                    )}
                  </div>
                </div>
              </div>
              {oracleError && (
                <div className="text-red-400 text-xs font-mono">
                  Oracle Error: {oracleError}
                </div>
              )}
            </section>
          )}

          {/* Health Factor, Collateral Choice, and Engine */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Health Factor */}
            {(() => {
              // Use the calculated health factor from user positions
              const actualHealthFactor = calculateHealthFactor();

              // Show loading state if data is still being fetched
              if (loading && currentAccount) {
                return (
                  <div className="border border-accent p-4 bg-card">
                    <div className="space-y-3">
                      <h3 className="text-accent text-sm">
                        HEALTH FACTOR
                      </h3>
                      <div className="font-mono text-sm text-accent">
                        LOADING...
                      </div>
                    </div>
                  </div>
                );
              }

              // Show connect wallet message if no wallet connected
              if (!currentAccount) {
                return (
                  <div className="border border-accent p-4 bg-card">
                    <div className="space-y-3">
                      <h3 className="text-accent text-sm">
                        HEALTH FACTOR
                      </h3>
                      <div className="font-mono text-sm text-accent">
                        ◦◦◦◦◦◦◦◦◦◦
                      </div>
                      <div className="text-lg font-mono text-accent">
                        --
                      </div>
                      <div className="text-sm text-accent">
                        ⚠ Connect Wallet
                      </div>
                    </div>
                  </div>
                );
              }

              // Show no positions message if wallet connected but no positions
              if (userPositions.length === 0 && !loading) {
                return (
                  <div className="border border-accent p-4 bg-card">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-accent text-sm">
                          HEALTH FACTOR
                        </h3>
                        <button
                          onClick={refreshData}
                          className="text-accent text-xs hover:text-white transition-colors"
                        >
                          [REFRESH]
                        </button>
                      </div>
                      <div className="font-mono text-sm text-accent">
                        ●●●●●●●●●●
                      </div>
                      <div className="text-lg font-mono text-green-400">
                        2.0
                      </div>
                      <div className="text-sm text-green-400">
                        ✓ No Positions
                      </div>
                    </div>
                  </div>
                );
              }

              const getHealthStatus = (hf: number) => {
                if (hf >= 2) {
                  return {
                    color: "green-500",
                    dots: "●●●●●●●●●●",
                    symbol: "✓",
                    status: "HEALTHY - Position Secure",
                  };
                } else if (hf >= 1.5) {
                  return {
                    color: "green-400",
                    dots: "●●●●●●●◦◦◦",
                    symbol: "✓",
                    status: "SAFE - Good Collateral",
                  };
                } else if (hf >= 1.1) {
                  return {
                    color: "yellow-500",
                    dots: "●●●●◦◦◦◦◦◦",
                    symbol: "⚠",
                    status: "MODERATE - Monitor Position",
                  };
                } else {
                  return {
                    color: "red-500",
                    dots: "●●◦◦◦◦◦◦◦◦",
                    symbol: "⚠",
                    status: "DANGER - Risk of Liquidation",
                  };
                }
              };

              const status = getHealthStatus(actualHealthFactor);
              return (
                <div
                  className={`border p-4 bg-card ${actualHealthFactor >= 2
                    ? "border-white"
                    : actualHealthFactor >= 1.5
                      ? "border-green-400"
                      : actualHealthFactor >= 1.1
                        ? "border-yellow-500"
                        : "border-red-500"
                    }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3
                        className={`text-sm ${actualHealthFactor >= 2
                          ? "text-white"
                          : actualHealthFactor >= 1.5
                            ? "text-green-400"
                            : actualHealthFactor >= 1.1
                              ? "text-yellow-500"
                              : "text-red-500"
                          }`}
                      >
                        HEALTH FACTOR
                      </h3>
                      <button
                        onClick={refreshData}
                        disabled={loading}
                        className={`text-xs hover:text-white transition-colors disabled:opacity-50 ${actualHealthFactor >= 2
                          ? "text-white"
                          : actualHealthFactor >= 1.5
                            ? "text-green-400"
                            : actualHealthFactor >= 1.1
                              ? "text-yellow-500"
                              : "text-red-500"
                          }`}
                      >
                        [REFRESH]
                      </button>
                    </div>
                    <div
                      className={`font-mono text-sm ${actualHealthFactor >= 2
                        ? "text-white"
                        : actualHealthFactor >= 1.5
                          ? "text-green-400"
                          : actualHealthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      {status.dots}
                    </div>
                    <div
                      className={`text-lg font-mono ${actualHealthFactor >= 2
                        ? "text-white"
                        : actualHealthFactor >= 1.5
                          ? "text-green-400"
                          : actualHealthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      {actualHealthFactor.toFixed(1)}
                    </div>
                    <div
                      className={`text-sm ${actualHealthFactor >= 2
                        ? "text-white"
                        : actualHealthFactor >= 1.5
                          ? "text-green-400"
                          : actualHealthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      {status.symbol} {status.status}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Collateral Choice */}
            {(() => {

              return (
                <div className="border border-accent p-4 bg-card">
                  <div className="space-y-4">
                    <h3 className="text-accent text-sm">
                      COLLATERAL CHOICE
                    </h3>

                    {/* BTC Option */}
                    <div
                      className={`border p-4 cursor-pointer transition-colors ${selectedCollateral === "BTC"
                        ? "border-white bg-background/20"
                        : "border-accent/50 hover:border-accent"
                        }`}
                      onClick={() =>
                        setSelectedCollateral("BTC")
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="text-[6px] leading-[0.8] font-mono text-accent w-32 h-16 flex items-center mt-[7px] mr-[16px] mb-[0px] ml-[0px]">
                            <pre className="whitesp text-[2px] text-[2px]ace-pre text-[2px]">
                              {`                                                             
                     @@@@@@@@@@@@@@@@@@@                    
                @@@@@@@@@@@@@@@@@@@@@@@@@@@@                
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             
           @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           
         @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@         
        @@@@@@@@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@@@@@       
      @@@@@@@@@@@@@@@@@@@@@@@    @@   @@@@@@@@@@@@@@@@      
     @@@@@@@@@@@@@@@@   @@@@@  @@@    @@@@@@@@@@@@@@@@@     
    @@@@@@@@@@@@@@@@@           @@   @@@@@@@@@@@@@@@@@@@    
  @@@@@@@@@@@@@@@@@@@ @@             @@@@@@@@@@@@@@@@@@@@@  
  @@@@@@@@@@@@@@@@@@@@@@@                @@@@@@@@@@@@@@@@@  
  @@@@@@@@@@@@@@@@@@@@@@      @@@@@        @@@@@@@@@@@@@@@  
 @@@@@@@@@@@@@@@@@@@@@@@      @@@@@@@       @@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@@@@@@@      @@@@@@@@       @@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@@@@@@@        @@@@        @@@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@@@@@@                    @@@@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@@@@@@      @@@@        @@@@@@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@@@@@       @@@@@@@       @@@@@@@@@@@@@@@@@ 
  @@@@@@@@@@@@@@@@@@@      @@@@@@@@@       @@@@@@@@@@@@@@@@ 
  @@@@@@@@@@@@@@          @@@@@@@@@@       @@@@@@@@@@@@@@@@ 
  @@@@@@@@@@@@@                           @@@@@@@@@@@@@@@@  
   @@@@@@@@@@@@@@@@@@@                    @@@@@@@@@@@@@@@   
    @@@@@@@@@@@@@@@@@@   @@@            @@@@@@@@@@@@@@@@@   
     @@@@@@@@@@@@@@@@    @@   @@@@@@@@@@@@@@@@@@@@@@@@@     
      @@@@@@@@@@@@@@@   @@     @@@@@@@@@@@@@@@@@@@@@@@      
       @@@@@@@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@@@@@@@       
         @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@        
          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           
             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             
                @@@@@@@@@@@@@@@@@@@@@@@@@@@@                
                     @@@@@@@@@@@@@@@@@@                     
                                                            `}
                            </pre>
                          </div>
                          <div className="pt-2">
                            <div className="text-white text-sm font-mono">
                              BTC
                            </div>
                            <div className="text-accent text-xs">
                              SUPPLIED: 0
                            </div>
                            <div className="text-accent text-xs">
                              MCR : 110 %
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* SUI Option */}
                    <div
                      className={`border p-4 cursor-pointer transition-colors ${selectedCollateral === "SUI"
                        ? "border-white bg-background/20"
                        : "border-accent/50 hover:border-accent"
                        }`}
                      onClick={() =>
                        setSelectedCollateral("SUI")
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="text-[6px] leading-[0.8] font-mono text-accent w-32 h-16 flex items-center mt-[9px] mr-[16px] mb-[0px] ml-[1px]">
                            <pre className="whitesp text-[2px] text-[2px]ace-pre text-[2px]">
                              {`                                                             
                     @@@@@@@@@@@@@@@@@@                     
                 @@@@@@@@@@@@@@@@@@@@@@@@@@                 
              @@@@@@@@@@@@@@@  @@@@@@@@@@@@@@@              
           @@@@@@@@@@@@@@@@@    @@@@@@@@@@@@@@@@@           
         @@@@@@@@@@@@@@@@@@      @@@@@@@@@@@@@@@@@@         
        @@@@@@@@@@@@@@@@@          @@@@@@@@@@@@@@@@@        
       @@@@@@@@@@@@@@@@@     @@     @@@@@@@@@@@@@@@@@@      
     @@@@@@@@@@@@@@@@@@@    @@@@    @@@@@@@@@@@@@@@@@@@     
    @@@@@@@@@@@@@@@@@@    @@@@@@@@    @@@@@@@@@@@@@@@@@@    
   @@@@@@@@@@@@@@@@@@     @@@@@@@@@    @@@@@@@@@@@@@@@@@@   
  @@@@@@@@@@@@@@@@@@     @@@@@@@@@@@    @@@@@@@@@@@@@@@@@@  
  @@@@@@@@@@@@@@@@@      @@@@@@@@@@@@    @@@@@@@@@@@@@@@@@  
 @@@@@@@@@@@@@@@@@       @@@@@@@@@@@@@    @@@@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@@    @    @@@@@@@@@@@@@    @@@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@@    @@@    @@@@@@@@@@@@@    @@@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@@    @@@@@     @@@@@@@@@@@@    @@@@@@@@@@@@@@ 
 @@@@@@@@@@@@@    @@@@@@@@       @@@@@@@@@    @@@@@@@@@@@@@ 
 @@@@@@@@@@@@@   @@@@@@@@@@@         @@@@@@   @@@@@@@@@@@@@ 
 @@@@@@@@@@@@    @@@@@@@@@@@@@@@       @@@@    @@@@@@@@@@@@ 
  @@@@@@@@@@@    @@@@@@@@@@@@@@@@@@     @@@    @@@@@@@@@@@  
  @@@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@     @    @@@@@@@@@@@  
   @@@@@@@@@@@   @@@@@@@@@@@@@@@@@@@@@@   @   @@@@@@@@@@@   
    @@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@@       @@@@@@@@@@    
     @@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@      @@@@@@@@@@     
       @@@@@@@@@     @@@@@@@@@@@@@@@@@@     @@@@@@@@@@      
        @@@@@@@@@      @@@@@@@@@@@@@@      @@@@@@@@@        
         @@@@@@@@@@        @@@@@@        @@@@@@@@@@         
           @@@@@@@@@@@                @@@@@@@@@@@           
              @@@@@@@@@@@@@       @@@@@@@@@@@@              
                 @@@@@@@@@@@@@@@@@@@@@@@@@@                 
                     @@@@@@@@@@@@@@@@@@                     
                                                            `}
                            </pre>
                          </div>
                          <div className="pt-2">
                            <div className="text-white text-sm font-mono">
                              SUI
                            </div>
                            <div className="text-accent text-xs">
                              SUPPLIED: {suiHoldings.supplied.toFixed(2)}
                            </div>
                            <div className="text-accent text-xs">
                              MCR : 130 %
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Amount Input */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-accent text-xs font-mono">
                          AMOUNT
                        </label>
                        {selectedCollateral === "SUI" && currentAccount && (
                          <div className="text-accent text-xs font-mono">
                            BALANCE: {formatAmount(suiBalance)} SUI
                            <br />
                            <span className="text-[10px] opacity-70">
                              {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
                            </span>
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        value={collateralAmount}
                        onChange={(e) =>
                          setCollateralAmount(e.target.value)
                        }
                        placeholder="0.00"
                        className="w-full p-3 bg-input-background border border-accent text-white font-mono text-sm focus:border-white focus:outline-none transition-colors"
                      />
                      <div className="flex justify-between items-center">
                        <div className="text-accent text-xs font-mono">
                          {selectedCollateral}
                        </div>
                        {selectedCollateral === "SUI" && currentAccount && (
                          <button
                            onClick={() => setCollateralAmount(formatAmount(suiBalance))}
                            className="text-accent text-xs font-mono hover:text-white transition-colors"
                          >
                            [MAX]
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-center space-x-3 mt-2">
                      <button
                        className="text-xs font-mono px-2 py-2 border border-white bg-white text-background hover:bg-accent/10 hover:text-white transition-colors text-[14px] px-[40px] py-[5px] disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={
                          !currentAccount ||
                          !collateralAmount ||
                          parseFloat(collateralAmount) <= 0 ||
                          loading ||
                          isAddingCollateral ||
                          (selectedCollateral === "SUI" && parseFloat(collateralAmount) > parseFloat(formatAmount(suiBalance)))
                        }
                        onClick={async (e) => {
                          e.preventDefault();

                          if (!currentAccount) {
                            alert("Please connect your wallet first");
                            return;
                          }

                          if (!collateralAmount) {
                            alert("Please enter an amount");
                            return;
                          }

                          if (parseFloat(collateralAmount) <= 0) {
                            alert("Please enter a valid amount greater than 0");
                            return;
                          }

                          if (selectedCollateral === "SUI" && parseFloat(collateralAmount) > parseFloat(formatAmount(suiBalance))) {
                            alert(`Insufficient SUI balance. Available: ${formatAmount(suiBalance)} SUI`);
                            return;
                          }

                          try {
                            setIsAddingCollateral(true);

                            if (userPositions.length === 0) {
                              // Create position with 0 ALP using direct SDK call
                              const tx = new Transaction();

                              // Get SUI coins
                              const suiCoins = await suiClient.getCoins({
                                owner: currentAccount.address,
                                coinType: "0x2::sui::SUI",
                              });

                              if (suiCoins.data.length === 0) {
                                throw new Error("No SUI coins available");
                              }

                              const collateralAmountParsed = parseAmount(collateralAmount);
                              const alpAmount = 1; // No ALP minted, deposit only

                              // Split the exact collateral amount
                              const [collateralCoin] = tx.splitCoins(tx.object(suiCoins.data[0].coinObjectId), [collateralAmountParsed]);

                              // Call create_position with 0 ALP
                              tx.moveCall({
                                target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::create_position`,
                                typeArguments: ["0x2::sui::SUI"],
                                arguments: [
                                  tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                                  tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                                  tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
                                  collateralCoin,
                                  tx.pure.u64(alpAmount.toString()),
                                ],
                              });

                              // Execute transaction
                              await new Promise((resolve, reject) => {
                                signAndExecuteTransaction(
                                  {
                                    transaction: tx
                                  },
                                  {
                                    onSuccess: async (result) => {
                                      await refreshData();
                                      resolve(result);
                                    },
                                    onError: (error) => {
                                      reject(error);
                                    },
                                  }
                                );
                              });

                              alert(`✅ Position created with ${collateralAmount} SUI deposited!`);
                            } else {
                              // Add to existing position
                              const positionId = userPositions[0].id;
                              await addCollateralDirect(positionId, collateralAmount);
                              alert(`✅ Successfully added ${collateralAmount} ${selectedCollateral} to position!`);
                            }

                            setCollateralAmount("");
                          } catch (error) {
                            console.error("Error depositing collateral:", error);
                            alert(`Error depositing collateral: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          } finally {
                            setIsAddingCollateral(false);
                          }
                        }}
                      >
                        {loading || isAddingCollateral ? "DEPOSITING..." : "DEPOSIT"}
                      </button>

                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Engine */}
            {(() => {

              return (
                <div className="border border-accent p-4 bg-card">
                  <div className="space-y-4">
                    <h3 className="text-accent text-sm">
                      ENGINE
                    </h3>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <label className="text-accent text-xs font-mono">
                        AMOUNT
                      </label>
                      <input
                        type="number"
                        value={alpAmount}
                        onChange={(e) =>
                          setAlpAmount(e.target.value)
                        }
                        placeholder="0.00"
                        className="w-full p-3 bg-input-background border border-accent text-white font-mono text-sm focus:border-white focus:outline-none transition-colors"
                      />
                      <div className="text-accent text-xs font-mono">
                        CHF
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 mt-4">
                      <button
                        className="w-full text-xs font-mono px-4 py-2 border border-white bg-white text-background hover:bg-accent/10 hover:text-white transition-colors text-right"
                        disabled={
                          !currentAccount ||
                          !alpAmount ||
                          parseFloat(alpAmount) <= 0 ||
                          loading ||
                          userPositions.length === 0
                        }
                        onClick={async () => {
                          if (!currentAccount) {
                            alert("Please connect your wallet first");
                            return;
                          }

                          if (!alpAmount) {
                            alert("Please enter an amount to mint");
                            return;
                          }

                          if (parseFloat(alpAmount) <= 0) {
                            alert("Please enter a valid amount greater than 0");
                            return;
                          }

                          if (userPositions.length === 0) {
                            alert("No position found. Please create a position first by depositing collateral.");
                            return;
                          }

                          try {
                            const positionId = userPositions[0].id;
                            await mintAlp(positionId, alpAmount);
                            setAlpAmount("");
                            alert(`✅ Successfully minted ${alpAmount} ALP!`);
                          } catch (error) {
                            console.error("Error minting ALP:", error);
                            alert(`Error minting ALP: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          }
                        }}
                      >
                        {loading ? "MINTING..." : "MINT"}
                      </button>
                      <button
                        className="w-full text-xs font-mono text px-4 py-2 border border-accent bg-card text-accent hover:bg-accent hover:text-background transition-colors text-right"
                        disabled={
                          !currentAccount ||
                          !alpAmount ||
                          parseFloat(alpAmount) <= 0 ||
                          loading ||
                          userPositions.length === 0 ||
                          parseFloat(alpAmount) > parseFloat(formatAmount(alpBalance))
                        }
                        onClick={async () => {
                          if (!currentAccount) {
                            alert("Please connect your wallet first");
                            return;
                          }

                          if (!alpAmount) {
                            alert("Please enter an amount to burn");
                            return;
                          }

                          if (parseFloat(alpAmount) <= 0) {
                            alert("Please enter a valid amount greater than 0");
                            return;
                          }

                          if (userPositions.length === 0) {
                            alert("No position found. Please create a position first.");
                            return;
                          }

                          if (parseFloat(alpAmount) > parseFloat(formatAmount(alpBalance))) {
                            alert(`Insufficient ALP balance. Available: ${formatAmount(alpBalance)} ALP`);
                            return;
                          }

                          try {
                            const positionId = userPositions[0].id;
                            await burnAlp(positionId, alpAmount);
                            setAlpAmount("");
                            alert(`✅ Successfully burned ${alpAmount} ALP!`);
                          } catch (error) {
                            console.error("Error burning ALP:", error);
                            alert(`Error burning ALP: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          }
                        }}
                      >
                        {loading ? "BURNING..." : "BURN"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Address Collateral Lookup Section */}
          <section className="space-y-8 max-w-4xl mx-auto">
            <h2 className="text-center text-foreground">
              COLLATERAL LOOKUP
            </h2>

            <div className="border border-accent p-6 bg-card">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-accent text-sm mb-4">
                    CHECK ANY ADDRESS COLLATERAL
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-center max-w-2xl mx-auto">
                    <input
                      type="text"
                      placeholder="0x4067d43651a66d0b41ba4bc945d21df9b75a14d4c40341ad156725c1f424550b"
                      value={lookupAddress}
                      onChange={(e) => setLookupAddress(e.target.value)}
                      className="flex-1 px-3 py-2 bg-background border border-accent text-foreground font-mono text-sm min-w-0"
                      disabled={isLookingUp}
                    />
                    <button
                      onClick={async () => {
                        if (!lookupAddress.trim()) {
                          alert("Please enter an address");
                          return;
                        }

                        try {
                          await checkAddressCollateral(lookupAddress.trim());
                        } catch (error) {
                          alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                      }}
                      disabled={isLookingUp || !lookupAddress.trim()}
                      className="px-6 py-2 bg-accent text-background font-mono text-sm hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isLookingUp ? "CHECKING..." : "CHECK"}
                    </button>
                  </div>
                </div>

                {/* Results Display */}
                {lookupResults.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h4 className="text-accent text-sm text-center">
                      FOUND {lookupResults.length} POSITION{lookupResults.length !== 1 ? 'S' : ''}
                    </h4>
                    <div className="grid gap-4">
                      {lookupResults.map((position, index) => (
                        <div key={position.id} className="border border-accent/50 p-4 bg-card/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                            <div>
                              <div className="text-accent mb-1">POSITION #{index + 1}</div>
                              <div className="space-y-1">
                                <div>ID: {position.id.slice(0, 20)}...</div>
                                <div>OWNER: {position.owner.slice(0, 20)}...</div>
                                <div>TYPE: {position.collateralType}</div>
                                <div>UPDATED: {position.lastUpdate}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-accent mb-1">AMOUNTS</div>
                              <div className="space-y-1">
                                <div>COLLATERAL: {position.collateralAmount} SUI</div>
                                <div>ALP DEBT: {position.alpMinted} ALP</div>
                                <div>RATIO: {position.collateralRatio}%</div>
                                <div>FEES: {position.accumulatedFee} ALP</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lookupResults.length === 0 && lookupAddress && !isLookingUp && (
                  <div className="text-center text-accent text-sm mt-4">
                    NO POSITIONS FOUND FOR THIS ADDRESS
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Metrics Section */}
          <section className="space-y-8">
            <h2 className="text-center text-foreground">
              STABILITY METRICS
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="PEG STATUS"
                value="$1.0000"
                change="0.01%"
                indicator="▲"
              />
              <MetricCard
                title="SUPPLY"
                value="1.2M"
                change="0.5%"
                indicator="▼"
              />
              <MetricCard
                title="COLLATERAL"
                value="125%"
                change="0.0%"
                indicator="◦"
              />
              <MetricCard
                title="VOLUME"
                value="45.2K"
                change="2.1%"
                indicator="▲"
              />
            </div>
          </section>

          <AsciiDivider />

          {/* Technical Section */}
          <section className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">
                    FAST FINALITY
                  </h3>
                  <p>
                    Sub-second transaction confirmation on Sui's
                    parallel execution architecture
                  </p>
                </div>
              </div>

              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">LOW FEES</h3>
                  <p>
                    Minimal transaction costs maintain economic
                    efficiency at scale
                  </p>
                </div>
              </div>

              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">SECURE</h3>
                  <p>
                    Multi-layer security through Sui's
                    object-centric smart contract model
                  </p>
                </div>
              </div>
            </div>
          </section>

          <AsciiDivider />

          {/* Documentation Section */}
          <section className="space-y-8">
            <h2 className="text-center text-foreground">
              DOCUMENTATION
            </h2>

            <div className="text-center space-y-4">
              <p className="max-w-2xl mx-auto">
                Complete technical documentation, API
                references, and integration guides
              </p>

              <div className="flex justify-center space-x-4">
                <AsciiButton>API DOCS</AsciiButton>
                <AsciiButton>WHITEPAPER</AsciiButton>
              </div>
            </div>

            <div className="text-center">
              <div className="text-accent text-sm px-[0px] pt-[59px] pr-[0px] pb-[0px] pl-[0px] mx-[0px] my-[-38px]">
                HOME &gt; DOCUMENTATION &gt; API REFERENCE
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}