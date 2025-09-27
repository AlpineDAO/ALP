import { useState } from "react";
import { Header } from "./components/Header";
import { AsciiButton } from "./components/AsciiButton";
import { MetricCard } from "./components/MetricCard";
import { DataTable } from "./components/DataTable";
import { AsciiDivider } from "./components/AsciiDivider";
import { Footer } from "./components/Footer";
import { GlitchAsciiBackground } from "./components/GlitchAsciiBackground";

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
      <main className="max-w-6xl mx-auto px-8 py-16">
        <div className="space-y-16">
          <AsciiDivider type="double" />

          {/* Health Factor and Collateral Choice */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Health Factor */}
            {(() => {
              const healthFactor = 1.7;

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

              const status = getHealthStatus(healthFactor);

              return (
                <div
                  className={`border p-4 bg-card ${healthFactor >= 2
                    ? "border-white"
                    : healthFactor >= 1.5
                      ? "border-green-400"
                      : healthFactor >= 1.1
                        ? "border-yellow-500"
                        : "border-red-500"
                    }`}
                >
                  <div className="space-y-3">
                    <h3
                      className={`text-sm ${healthFactor >= 2
                        ? "text-white"
                        : healthFactor >= 1.5
                          ? "text-green-400"
                          : healthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      HEALTH FACTOR
                    </h3>
                    <div
                      className={`font-mono text-sm ${healthFactor >= 2
                        ? "text-white"
                        : healthFactor >= 1.5
                          ? "text-green-400"
                          : healthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      {status.dots}
                    </div>
                    <div
                      className={`text-lg font-mono ${healthFactor >= 2
                        ? "text-white"
                        : healthFactor >= 1.5
                          ? "text-green-400"
                          : healthFactor >= 1.1
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    >
                      {healthFactor}
                    </div>
                    <div
                      className={`text-sm ${healthFactor >= 2
                        ? "text-white"
                        : healthFactor >= 1.5
                          ? "text-green-400"
                          : healthFactor >= 1.1
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

              return (
                <div className="border border-accent p-4 bg-card ">
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
                          <div className="text-[6px] leading-[0.8] font-mono text-accent w-32 h-16 flex items-center">
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
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 border border-accent self-center ${selectedCollateral === "BTC"
                            ? "bg-white"
                            : ""
                            }`}
                        ></div>
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
                          <div className="text-[6px] leading-[0.8] font-mono text-accent w-32 h-16 flex items-center">
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
                            <div className="flex space-x-2 mt-2">
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 border border-accent self-center ${selectedCollateral === "SUI"
                            ? "bg-white"
                            : ""
                            }`}
                        ></div>
                      </div>
                    </div>
                    <div className="text-center text-accent text-xs font-mono mt-3">
                      Selected: {selectedCollateral}
                    </div>
                    <div className="flex space-x-4 justify-center mt-4">
                      <AsciiButton
                        variant="white"
                        onClick={() => console.log("Add BTC clicked")}
                      >
                        ADD
                      </AsciiButton>
                      <AsciiButton
                        variant="primary"
                        onClick={() => console.log("Remove BTC clicked")}
                      >
                        WITHDRAW
                      </AsciiButton>
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

          {/* Data Table Section */}
          <section className="space-y-8">
            <h2 className="text-center text-foreground">
              REAL-TIME DATA
            </h2>

            <DataTable data={metricsData} />

            <div className="text-center">
              <div className="text-accent text-sm">
                Audit Progress: ◦◦◦◦◦◦◦●●● 70%
              </div>
            </div>
          </section>

          <AsciiDivider />

          {/* Technical Section */}
          <section className="space-y-8">
            <h2 className="text-right text-foreground text-sm font-mono">
              SUI INTEGRATION
            </h2>

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
              <div className="text-accent text-sm">
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