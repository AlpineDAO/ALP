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
    withdrawAllCollateral,
    withdrawPartialCollateral,
    refreshData,
  } = useALP();

  // Shared state for collateral amount and selection
  const [selectedCollateral, setSelectedCollateral] = useState<"BTC" | "SUI">("SUI");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [alpAmount, setAlpAmount] = useState("");
  const [isAddingCollateral, setIsAddingCollateral] = useState(false);

  // State for withdraw functionality
  const [isWithdrawing, setIsWithdrawing] = useState(false);

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
        throw new Error("No SUI coins available for collateral");
      }

      // Calculate total available SUI balance
      const totalSuiBalance = suiCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
      const amountParsed = parseAmount(amount);
      const gasReserve = BigInt(10_000_000); // Reserve 0.01 SUI for gas

      if (totalSuiBalance < amountParsed + gasReserve) {
        throw new Error(`Insufficient SUI balance. Available: ${formatAmount(totalSuiBalance - gasReserve)} SUI, Required: ${amount} SUI`);
      }

      // Find a coin that can cover both collateral + gas
      const suitableCoin = suiCoins.data.find(coin =>
        BigInt(coin.balance) >= amountParsed + gasReserve
      );

      if (!suitableCoin) {
        throw new Error(`Insufficient SUI balance. Need at least ${formatAmount(amountParsed + gasReserve)} SUI (including gas reserve)`);
      }

      console.log("Using coin for add_collateral:", suitableCoin.coinObjectId, "with balance:", suitableCoin.balance);

      // Set this coin as gas payment
      tx.setGasPayment([{
        objectId: suitableCoin.coinObjectId,
        version: suitableCoin.version,
        digest: suitableCoin.digest
      }]);

      // Split the exact amount from the gas coin
      const [collateralCoin] = tx.splitCoins(tx.gas, [amountParsed]);      // Call add_collateral with the exact amount
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

  // Calculate total SUI holdings - simplified version
  const calculateTotalSuiHoldings = () => {
    const availableSui = Number(formatAmount(suiBalance));
    const suppliedSui = userPositions.reduce((total, position) => {
      // Check for both formats: "SUI" (converted from ASCII) and "0x2::sui::SUI" (raw type)
      if (position.collateralType === "SUI" || position.collateralType === "0x2::sui::SUI") {
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

  // Calculate maximum safe ALP amount based on collateral and health factor
  const calculateMaxSafeAlpAmount = (collateralAmountSui: string): string => {
    if (!collateralAmountSui || parseFloat(collateralAmountSui) <= 0) return "0";

    // Get current SUI price in USD
    const suiPriceUsd = getSuiPriceUsd();
    const chfToUsdRate = getChfToUsdRate();

    // Calculate collateral value in USD
    const collateralValueUsd = parseFloat(collateralAmountSui) * suiPriceUsd;

    // Calculate collateral value in CHF (ALP is pegged to CHF)
    const collateralValueChf = collateralValueUsd / chfToUsdRate;

    // Use minimum collateral ratio from contract (150%)
    // Max ALP = Collateral Value CHF / 1.5
    const maxAlpAmount = collateralValueChf / 1.5;

    return maxAlpAmount.toFixed(6);
  };

  // Calculate maximum additional ALP for existing position
  const calculateMaxAdditionalAlp = (): string => {
    if (userPositions.length === 0) return "0";

    const position = userPositions[0];
    const currentCollateralSui = Number(formatAmount(position.collateralAmount));

    // Get current SUI price in USD
    const suiPriceUsd = getSuiPriceUsd();
    const chfToUsdRate = getChfToUsdRate();

    // Calculate total collateral value in CHF
    const totalCollateralValueUsd = currentCollateralSui * suiPriceUsd;
    const totalCollateralValueChf = totalCollateralValueUsd / chfToUsdRate;

    // Calculate current ALP debt
    const currentAlpDebt = Number(formatAmount(position.alpMinted));

    // Calculate max total ALP based on 150% ratio
    const maxTotalAlp = totalCollateralValueChf / 1.5;

    // Calculate additional ALP we can mint
    const additionalAlp = Math.max(0, maxTotalAlp - currentAlpDebt);

    return additionalAlp.toFixed(6);
  };

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
                              AVAILABLE: {suiHoldings.available.toFixed(2)}
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
                        className="text-xs font-mono px-6 py-2 border border-accent bg-card text-accent hover:bg-accent hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                          console.log("DEPOSIT/CREATE POSITION button clicked");
                          console.log("Current state:", {
                            hasAccount: !!currentAccount,
                            collateralAmount,
                            userPositionsLength: userPositions.length,
                            suiBalance: formatAmount(suiBalance)
                          });

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
                              // Create position with minimal ALP - simplified version
                              console.log("Creating new position with collateral:", collateralAmount, "SUI");

                              const tx = new Transaction();

                              // Parse amounts
                              const collateralAmountParsed = parseAmount(collateralAmount);
                              const minAlpAmount = 1; // 0.000000001 ALP (minimum possible on Sui with 9 decimals)

                              console.log("Parsed amounts:", {
                                collateralAmount: collateralAmountParsed.toString(),
                                alpAmount: minAlpAmount
                              });

                              // Get SUI coins
                              const suiCoins = await suiClient.getCoins({
                                owner: currentAccount.address,
                                coinType: "0x2::sui::SUI",
                              });

                              if (suiCoins.data.length === 0) {
                                throw new Error("No SUI coins found in wallet");
                              }

                              console.log("Available SUI coins:", suiCoins.data.length);

                              // Reserve gas (0.01 SUI = 10_000_000 MIST)
                              const gasReserve = 10_000_000n;

                              // Find a coin that can cover both collateral + gas
                              const suitableCoin = suiCoins.data.find(coin =>
                                BigInt(coin.balance) >= collateralAmountParsed + gasReserve
                              );

                              if (!suitableCoin) {
                                throw new Error(`Insufficient SUI balance. Need at least ${formatAmount(collateralAmountParsed + gasReserve)} SUI (including gas reserve)`);
                              }

                              console.log("Using coin:", suitableCoin.coinObjectId, "with balance:", suitableCoin.balance);

                              // Set this coin as gas payment
                              tx.setGasPayment([{
                                objectId: suitableCoin.coinObjectId,
                                version: suitableCoin.version,
                                digest: suitableCoin.digest
                              }]);

                              const [collateralCoin] = tx.splitCoins(
                                tx.gas,
                                [collateralAmountParsed]
                              );

                              console.log("Contract addresses:", {
                                packageId: CONTRACT_ADDRESSES.PACKAGE_ID,
                                protocolState: CONTRACT_ADDRESSES.PROTOCOL_STATE,
                                collateralConfig: CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG,
                                vault: CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT
                              });

                              // Call create_position
                              tx.moveCall({
                                target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::create_position`,
                                typeArguments: ["0x2::sui::SUI"],
                                arguments: [
                                  tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                                  tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                                  tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
                                  collateralCoin,
                                  tx.pure.u64(minAlpAmount),
                                ],
                              });

                              console.log("Transaction constructed, executing...");

                              // Execute transaction
                              await new Promise((resolve, reject) => {
                                signAndExecuteTransaction(
                                  { transaction: tx },
                                  {
                                    onSuccess: async (result) => {
                                      console.log("Transaction successful:", result);
                                      console.log("Transaction digest:", result.digest);

                                      // Wait a bit for the transaction to be processed
                                      setTimeout(async () => {
                                        console.log("Refreshing data after transaction...");
                                        await refreshData();
                                        console.log("Data refreshed, positions:", userPositions.length);
                                      }, 2000);

                                      resolve(result);
                                    },
                                    onError: (error) => {
                                      console.error("Transaction failed:", error);
                                      reject(error);
                                    },
                                  }
                                );
                              });

                              alert(`✅ Position created with ${collateralAmount} SUI deposited!`);
                            } else {
                              // Add to existing position - anyone can deposit to prevent liquidation
                              const position = userPositions[0];
                              console.log("Adding collateral to existing position:", {
                                positionId: position.id,
                                positionOwner: position.owner,
                                currentWallet: currentAccount.address,
                                ownerMatch: position.owner === currentAccount.address
                              });

                              await addCollateralDirect(position.id, collateralAmount);
                              alert(`✅ Successfully added ${collateralAmount} ${selectedCollateral} to position!`);
                            }

                            setCollateralAmount("");
                          } catch (error) {
                            console.error("Error depositing collateral:", error);

                            // Provide more helpful error messages
                            let errorMessage = error instanceof Error ? error.message : 'Unknown error';

                            if (errorMessage.includes('MoveAbort') && errorMessage.includes('6')) {
                              errorMessage = `Authorization Error: You don't own this position or the protocol is paused. Please create a new position instead or check if you're using the correct wallet.`;
                            } else if (errorMessage.includes('No valid gas coins')) {
                              errorMessage = `Transaction failed: No valid gas coins found. Please ensure you have sufficient SUI balance (Current: ${formatAmount(suiBalance)} SUI). You need at least 0.1 SUI for gas fees plus the deposit amount.`;
                            } else if (errorMessage.includes('Insufficient SUI balance')) {
                              errorMessage = `${errorMessage}\n\nCurrent wallet balance: ${formatAmount(suiBalance)} SUI\nRequired: ${collateralAmount} SUI + 0.1 SUI (gas fees)`;
                            } else if (errorMessage.includes('Position ownership mismatch')) {
                              errorMessage = `${errorMessage}\n\nThis usually means you need to create a new position with the current wallet.`;
                            }

                            alert(`Error depositing collateral: ${errorMessage}`);
                          } finally {
                            setIsAddingCollateral(false);
                          }
                        }}
                      >
                        {loading || isAddingCollateral ?
                          (userPositions.length === 0 ? "CREATING POSITION..." : "DEPOSITING...") :
                          (userPositions.length === 0 ? "CREATE POSITION" : "DEPOSIT")
                        }
                      </button>

                      {/* Withdraw Buttons - Only show if user has positions with collateral */}
                      {userPositions.length > 0 && userPositions[0].collateralAmount > 0n && (
                        <>


                          {/* Withdraw Button */}
                          <button
                            className="text-xs font-mono px-6 py-2 border border-accent bg-card text-accent hover:bg-accent hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={
                              !currentAccount ||
                              loading ||
                              isWithdrawing ||
                              userPositions.length === 0 ||
                              userPositions[0].collateralAmount === 0n ||
                              (userPositions[0].alpMinted > 0n && !collateralAmount) // If there's debt, require partial withdraw amount
                            }
                            onClick={async () => {
                              if (!currentAccount) {
                                alert("Please connect your wallet first");
                                return;
                              }

                              if (userPositions.length === 0) {
                                alert("No position found");
                                return;
                              }

                              const position = userPositions[0];
                              const hasDebt = position.alpMinted > 0n;

                              console.log("Attempting withdrawal from position:", {
                                positionId: position.id,
                                positionOwner: position.owner,
                                currentWallet: currentAccount.address,
                                ownerMatch: position.owner === currentAccount.address,
                                collateralAmount: formatAmount(position.collateralAmount),
                                alpDebt: formatAmount(position.alpMinted)
                              });

                              // Validate position ownership for withdrawal
                              if (position.owner !== currentAccount.address) {
                                alert(`❌ Cannot withdraw: Position belongs to ${position.owner}, but current wallet is ${currentAccount.address}. You can only withdraw from positions you own.`);
                                return;
                              }

                              try {
                                setIsWithdrawing(true);

                                if (collateralAmount && parseFloat(collateralAmount) > 0) {
                                  // Partial withdrawal
                                  if (parseFloat(collateralAmount) > parseFloat(formatAmount(position.collateralAmount))) {
                                    alert(`Cannot withdraw more than available collateral: ${formatAmount(position.collateralAmount)} SUI`);
                                    return;
                                  }

                                  await withdrawPartialCollateral(position.id, collateralAmount);
                                  alert(`✅ Successfully withdrew ${collateralAmount} SUI!`);
                                } else {
                                  // Full withdrawal - only allowed if no debt
                                  if (hasDebt) {
                                    alert("Cannot withdraw all collateral while you have ALP debt. Please burn your ALP first or specify a withdrawal amount.");
                                    return;
                                  }

                                  await withdrawAllCollateral(position.id);
                                  alert(`✅ Successfully withdrew all collateral (${formatAmount(position.collateralAmount)} SUI)!`);
                                }

                                setCollateralAmount("");
                              } catch (error) {
                                console.error("Error withdrawing collateral:", error);

                                let errorMessage = error instanceof Error ? error.message : 'Unknown error';

                                if (errorMessage.includes('MoveAbort') && errorMessage.includes('1')) {
                                  errorMessage = "Insufficient collateral ratio. Cannot withdraw - would leave position undercollateralized.";
                                } else if (errorMessage.includes('MoveAbort') && errorMessage.includes('6')) {
                                  errorMessage = "Authorization error. Make sure you own this position.";
                                }

                                alert(`Error withdrawing collateral: ${errorMessage}`);
                              } finally {
                                setIsWithdrawing(false);
                              }
                            }}
                          >
                            {isWithdrawing ? "WITHDRAWING..." : (collateralAmount ? "WITHDRAW" : "WITHDRAW ALL")}
                          </button>
                        </>
                      )}

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
                      <div className="flex justify-between items-center">
                        <label className="text-accent text-xs font-mono">
                          AMOUNT
                        </label>
                        {userPositions.length > 0 && (
                          <div className="text-accent text-xs font-mono">
                            MAX: {calculateMaxAdditionalAlp()} ALP
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        value={alpAmount}
                        onChange={(e) =>
                          setAlpAmount(e.target.value)
                        }
                        placeholder="0.00"
                        className="w-full p-3 bg-input-background border border-accent text-white font-mono text-sm focus:border-white focus:outline-none transition-colors"
                      />
                      <div className="flex justify-between items-center">
                        <div className="text-accent text-xs font-mono">
                          CHF
                        </div>
                        {userPositions.length > 0 && (
                          <button
                            onClick={() => setAlpAmount(calculateMaxAdditionalAlp())}
                            className="text-accent text-xs font-mono hover:text-white transition-colors"
                          >
                            [MAX]
                          </button>
                        )}
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
                            const position = userPositions[0];
                            console.log("Minting ALP from position:", {
                              positionId: position.id,
                              positionOwner: position.owner,
                              currentWallet: currentAccount.address,
                              ownerMatch: position.owner === currentAccount.address,
                              alpAmount
                            });

                            // Validate position ownership
                            if (position.owner !== currentAccount.address) {
                              throw new Error(`Position ownership mismatch. Position owner: ${position.owner}, Current wallet: ${currentAccount.address}`);
                            }

                            await mintAlp(position.id, alpAmount);
                            setAlpAmount("");
                            alert(`✅ Successfully minted ${alpAmount} ALP!`);
                          } catch (error) {
                            console.error("Error minting ALP:", error);

                            let errorMessage = error instanceof Error ? error.message : 'Unknown error';

                            if (errorMessage.includes('MoveAbort') && errorMessage.includes('6')) {
                              errorMessage = "Authorization Error: You don't own this position or the protocol is paused. Please create a new position with the current wallet.";
                            } else if (errorMessage.includes('MoveAbort') && errorMessage.includes('1')) {
                              errorMessage = "Insufficient Collateral: Your position doesn't have enough collateral to mint this amount of ALP. Add more collateral first.";
                            } else if (errorMessage.includes('Position ownership mismatch')) {
                              errorMessage = `${errorMessage}\n\nThis usually means you need to create a new position with the current wallet.`;
                            }

                            alert(`Error minting ALP: ${errorMessage}`);
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
                        title={
                          !currentAccount ? "Connect wallet first" :
                          !alpAmount ? "Enter amount to burn" :
                          parseFloat(alpAmount) <= 0 ? "Enter valid amount > 0" :
                          loading ? "Transaction in progress" :
                          userPositions.length === 0 ? "No positions found - create one first" :
                          parseFloat(alpAmount) > parseFloat(formatAmount(alpBalance)) ? `Insufficient ALP balance. Available: ${formatAmount(alpBalance)} ALP` :
                          "Burn ALP tokens"
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
                            const position = userPositions[0];
                            console.log("Burning ALP from position:", {
                              positionId: position.id,
                              positionOwner: position.owner,
                              currentWallet: currentAccount.address,
                              ownerMatch: position.owner === currentAccount.address,
                              alpAmount
                            });

                            // Validate position ownership
                            if (position.owner !== currentAccount.address) {
                              throw new Error(`Position ownership mismatch. Position owner: ${position.owner}, Current wallet: ${currentAccount.address}`);
                            }

                            await burnAlp(position.id, alpAmount);
                            setAlpAmount("");
                            alert(`✅ Successfully burned ${alpAmount} ALP!`);
                          } catch (error) {
                            console.error("Error burning ALP:", error);

                            let errorMessage = error instanceof Error ? error.message : 'Unknown error';

                            if (errorMessage.includes('MoveAbort') && errorMessage.includes('6')) {
                              errorMessage = "Authorization Error: You don't own this position or the protocol is paused. Please create a new position with the current wallet.";
                            } else if (errorMessage.includes('MoveAbort') && errorMessage.includes('2')) {
                              errorMessage = "Insufficient ALP: You don't have enough ALP tokens to burn this amount.";
                            } else if (errorMessage.includes('Position ownership mismatch')) {
                              errorMessage = `${errorMessage}\n\nThis usually means you need to create a new position with the current wallet.`;
                            }

                            alert(`Error burning ALP: ${errorMessage}`);
                          }
                        }}
                      >
                        {loading ? "BURNING..." : "BURN"}
                      </button>

                      {/* REPAY ALL Button - Only show if user has ALP debt */}
                      {userPositions.length > 0 && userPositions[0].alpMinted > 0n && (
                        <button
                          className="w-full text-xs font-mono px-4 py-2 border border-green-500 bg-card text-green-500 hover:bg-green-500 hover:text-background transition-colors"
                          disabled={
                            !currentAccount ||
                            loading ||
                            userPositions.length === 0 ||
                            userPositions[0].alpMinted === 0n ||
                            formatAmount(alpBalance) === "0" ||
                            parseFloat(formatAmount(alpBalance)) < parseFloat(formatAmount(userPositions[0].alpMinted))
                          }
                          title={
                            !currentAccount ? "Connect wallet first" :
                            loading ? "Transaction in progress" :
                            userPositions.length === 0 ? "No positions found" :
                            userPositions[0].alpMinted === 0n ? "No ALP debt to repay" :
                            formatAmount(alpBalance) === "0" ? "No ALP balance to repay with" :
                            parseFloat(formatAmount(alpBalance)) < parseFloat(formatAmount(userPositions[0].alpMinted)) ?
                              `Insufficient ALP. Need: ${formatAmount(userPositions[0].alpMinted)} ALP, Have: ${formatAmount(alpBalance)} ALP` :
                            "Repay all ALP debt"
                          }
                          onClick={async () => {
                            if (!currentAccount) {
                              alert("Please connect your wallet first");
                              return;
                            }

                            if (userPositions.length === 0) {
                              alert("No position found");
                              return;
                            }

                            const position = userPositions[0];
                            const debtAmount = formatAmount(position.alpMinted);

                            if (position.alpMinted === 0n) {
                              alert("No ALP debt to repay");
                              return;
                            }

                            if (parseFloat(formatAmount(alpBalance)) < parseFloat(debtAmount)) {
                              alert(`Insufficient ALP balance. Need: ${debtAmount} ALP, Have: ${formatAmount(alpBalance)} ALP`);
                              return;
                            }

                            try {
                              console.log("Repaying all ALP debt:", {
                                positionId: position.id,
                                debtAmount,
                                alpBalance: formatAmount(alpBalance)
                              });

                              // Validate position ownership
                              if (position.owner !== currentAccount.address) {
                                throw new Error(`Position ownership mismatch. Position owner: ${position.owner}, Current wallet: ${currentAccount.address}`);
                              }

                              await burnAlp(position.id, debtAmount);
                              alert(`✅ Successfully repaid all ALP debt (${debtAmount} ALP)!`);
                            } catch (error) {
                              console.error("Error repaying ALP debt:", error);

                              let errorMessage = error instanceof Error ? error.message : 'Unknown error';

                              if (errorMessage.includes('MoveAbort') && errorMessage.includes('6')) {
                                errorMessage = "Authorization Error: You don't own this position or the protocol is paused.";
                              } else if (errorMessage.includes('MoveAbort') && errorMessage.includes('2')) {
                                errorMessage = "Insufficient ALP: You don't have enough ALP tokens to repay this debt.";
                              } else if (errorMessage.includes('Position ownership mismatch')) {
                                errorMessage = `${errorMessage}\n\nThis usually means you need to create a new position with the current wallet.`;
                              }

                              alert(`Error repaying ALP debt: ${errorMessage}`);
                            }
                          }}
                        >
                          {loading ? "REPAYING..." : "REPAY ALL"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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