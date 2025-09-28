# ALP Stablecoin

An algorithmic stablecoin pegged to CHF (Swiss Franc), built on the Sui blockchain. ALP is inspired by DAI and Bucket Protocol, featuring collateral-backed positions and automated liquidation mechanisms.

## Features

- **CHF Peg**: 1 ALP = 1 CHF (Swiss Franc)
- **Collateral-Backed**: Mint ALP by depositing collateral at 150% minimum ratio
- **Liquidation System**: Automated liquidation when positions fall below 120% collateral ratio
- **Oracle Integration**: Real-time price feeds for accurate valuations
- **Web Interface**: React-based frontend for position management

## Architecture

### Smart Contracts (Move)

- **`alp.move`**: Core ALP stablecoin contract with minting and burning logic
- **`oracle.move`**: Price oracle system for collateral and peg price feeds
- **`liquidation.move`**: Automated liquidation engine for undercollateralized positions

### Frontend (React + Vite)

- Modern React application with TypeScript
- Sui wallet integration via `@mysten/dapp-kit`
- ASCII-styled retro UI design
- Real-time metrics and position management

## Getting Started

### Prerequisites

- Node.js 18+
- Sui CLI
- A Sui wallet (Sui Wallet, Suiet, etc.)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sui_stable
```

2. Install dependencies:
```bash
npm install
```

3. Build and deploy Move contracts:
```bash
cd alp
sui move build
sui client publish --gas-budget 100000000
```

4. Start the development server:
```bash
npm run dev
```

## Usage

### Minting ALP

1. Connect your Sui wallet
2. Deposit collateral (minimum 150% ratio)
3. Mint ALP tokens against your collateral

### Managing Positions

- View your collateral ratio and position health
- Add more collateral to improve your ratio
- Burn ALP to reduce debt and reclaim collateral

### Liquidation

Positions below 120% collateral ratio are automatically liquidated with a 13% penalty to maintain system stability.

## Constants

- **Minimum Collateral Ratio**: 150%
- **Liquidation Threshold**: 120%
- **Liquidation Penalty**: 13%
- **Stability Fee**: 2% annually

## Development

### Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production

### Testing Move Contracts

```bash
cd alp
sui move test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.