import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Header } from './components/Header';
import { AsciiButton } from './components/AsciiButton';
import { MetricCard } from './components/MetricCard';
import { DataTable } from './components/DataTable';
import { AsciiDivider } from './components/AsciiDivider';
import { Footer } from './components/Footer';
import { GlitchAsciiBackground } from './components/GlitchAsciiBackground';

const metricsData = [
  { metric: 'Peg Stability', value: '99.98%', change: '0.01%', indicator: '▲' as const },
  { metric: 'Total Supply', value: '1.2M', change: '0.5%', indicator: '▼' as const },
  { metric: 'Collateral Ratio', value: '125%', change: '0.0%', indicator: '◦' as const },
  { metric: 'Daily Volume', value: '45.2K', change: '2.1%', indicator: '▲' as const }
];

export default function App() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

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
            <div className="text-2xl mt-4">
              S U I S T A B L E
            </div>
            <div className="text-lg mt-4 opacity-50">
              ═══════════════════════════════════════════════
            </div>
            <div className="mt-16 cursor-auto">
              <AsciiButton onClick={() => console.log('Mint ALPs clicked')}>
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
            <h2 className="text-center text-foreground">
              SUI INTEGRATION
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">FAST FINALITY</h3>
                  <p>Sub-second transaction confirmation on Sui's parallel execution architecture</p>
                </div>
              </div>

              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">LOW FEES</h3>
                  <p>Minimal transaction costs maintain economic efficiency at scale</p>
                </div>
              </div>

              <div className="border border-accent p-6 bg-card">
                <div className="space-y-4">
                  <div className="text-accent">□</div>
                  <h3 className="text-foreground">SECURE</h3>
                  <p>Multi-layer security through Sui's object-centric smart contract model</p>
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
                Complete technical documentation, API references, and integration guides
              </p>

              <div className="flex justify-center space-x-4">
                <AsciiButton>
                  API DOCS
                </AsciiButton>
                <AsciiButton>
                  WHITEPAPER
                </AsciiButton>
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