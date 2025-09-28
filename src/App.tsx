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
import { formatAmount } from "./config/sui";
import { useCurrentAccount } from "@mysten/dapp-kit";

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
    refreshData,
  } = useALP();

  // Calculate total deposited value from user positions
  const totalDepositedValue = userPositions.reduce((total, position) => {
    // Convert collateral amount to CHF equivalent (simplified calculation)
    const chfValue = Number(position.collateralAmount) / 1_000_000_000; // Assuming 1 SUI = 1 CHF for demo
    return total + chfValue;
  }, 0);

  // Calculate overall health factor
  const calculateHealthFactor = () => {
    if (userPositions.length === 0) return 2.0;

    const totalCollateral = userPositions.reduce((sum, pos) => sum + Number(pos.collateralAmount), 0);
    const totalDebt = userPositions.reduce((sum, pos) => sum + Number(pos.alpMinted), 0);

    if (totalDebt === 0) return 2.0;
    console.log("Total Collateral:", totalCollateral, "Total Debt:", totalDebt);
    // Simplified health factor calculation
    return (totalCollateral * 0.75) / totalDebt; // Assuming 75% liquidation threshold
  };

  const healthFactor = calculateHealthFactor();

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
              CHF
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

          {/* No Positions Message */}
          {userPositions.length === 0 && currentAccount && !loading && (
            <section className="text-center space-y-4">
              <div className="text-accent text-sm font-mono">
                NO POSITIONS FOUND
              </div>
              <div className="text-foreground text-xs">
                Create a position to see your deposited value
              </div>
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
              const [
                selectedCollateral,
                setSelectedCollateral,
              ] = useState<"BTC" | "SUI">("BTC");
              const [amount, setAmount] = useState("");

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
                              SUPPLIED: 1.25
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
                              SUPPLIED: 10
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
                      <label className="text-accent text-xs font-mono">
                        AMOUNT
                      </label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) =>
                          setAmount(e.target.value)
                        }
                        placeholder="0.00"
                        className="w-full p-3 bg-input-background border border-accent text-white font-mono text-sm focus:border-white focus:outline-none transition-colors"
                      />
                      <div className="text-accent text-xs font-mono">
                        {selectedCollateral}
                      </div>
                    </div>
                    <div className="flex justify-center space-x-3 mt-2">
                      <button
                        className="text-xs font-mono px-2 py-2 border border-white bg-white text-background hover:bg-accent/10 hover:text-white transition-colors text-[14px] px-[40px] py-[5px]"
                        onClick={() =>
                          console.log(
                            `Add ${selectedCollateral} clicked`,
                          )
                        }
                      >
                        ADD
                      </button>
                      <button
                        className="text-xs font-mono px-2 py-2 border border-accent bg-card text-accent hover:bg-accent hover:text-background transition-colors text-[14px] px-[30px] py-[4px]"
                        onClick={() =>
                          console.log(
                            `Remove ${selectedCollateral} clicked`,
                          )
                        }
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Engine */}
            {(() => {
              const [amount, setAmount] = useState("");

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
                        value={amount}
                        onChange={(e) =>
                          setAmount(e.target.value)
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
                        onClick={() =>
                          console.log(
                            `Mint ${amount} CHF clicked`,
                          )
                        }
                      >
                        MINT
                      </button>
                      <button
                        className="w-full text-xs font-mono text px-4 py-2 border border-accent bg-card text-accent hover:bg-accent hover:text-background transition-colors text-right"
                        onClick={() =>
                          console.log(
                            `Burn ${amount} CHF clicked`,
                          )
                        }
                      >
                        BURN
                      </button>
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