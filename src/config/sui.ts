import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { createNetworkConfig } from "@mysten/dapp-kit";

// Sui network configuration
export const { networkConfig, useNetworkVariable } = createNetworkConfig({
    devnet: {
        url: getFullnodeUrl("devnet"),
    },
    testnet: {
        url: getFullnodeUrl("testnet"),
    },
    mainnet: {
        url: getFullnodeUrl("mainnet"),
    },
});

// Create Sui client - using testnet where contracts are deployed
export const suiClient = new SuiClient({
    url: getFullnodeUrl("testnet"),
});

// Contract addresses - Updated with FIXED deployed contract addresses (NEW DEPLOYMENT)
export const CONTRACT_ADDRESSES = {
    // FIXED CONTRACT DEPLOYMENT - September 2025
    PACKAGE_ID:
        "0x91fe36dcec97ad2f19ed9815328471686a9a358147ae0a04cbe0c85b4bd1d7f2",
    ALP_COIN_TYPE:
        "0x91fe36dcec97ad2f19ed9815328471686a9a358147ae0a04cbe0c85b4bd1d7f2::alp::ALP",
    PROTOCOL_STATE:
        "0x86efed23f80b7052c052e5a6870f976cc5267406f491c1cd02558ed6af74723e",
    ORACLE_STATE:
        "0xea3d97e9b5e83639ce9b01de927f9f87d90d6a113d17d3f6aa6124041da8d498",
    ORACLE_MANAGER_CAP:
        "0x898660d220d8491b852fd4aa1b9dc061e4cf18ac7cdbc26c89023242993fdc32",
    LIQUIDATION_MANAGER_CAP:
        "0xb06c79d213cfeb8f29baf0c95ae0a888547dd1e01529f99d371c27c6dd1f1eb4",
    UPGRADE_CAP:
        "0x771ad4007f7388fdd0430b770b770d0b13d95a8044d701a6869e3bb61d65bd88",
    ALP_COIN_METADATA:
        "0x782fb7e25afabdc1186fa6ba825c6b6ec39b2f2d1e97f581c3d4a04a1259d79a",
    // Collateral configurations (CREATED with initial price $0.40)
    SUI_COLLATERAL_CONFIG:
        "0xdc970f31e248ef25dec66e205f8df18e629f0ce44d3800ccccc741427bb0f9f9",
    SUI_COLLATERAL_VAULT:
        "0x61538d95ae300065453a2d61b21a957ff68d3c72501d0a3ce756e35764f7f595",
} as const;

// ALP Protocol constants
export const ALP_CONSTANTS = {
    CHF_PEG_TARGET: 1_000_000_000, // 1 CHF in 9 decimal precision
    MIN_COLLATERAL_RATIO: 1_500_000_000, // 150% in 9 decimal precision
    LIQUIDATION_THRESHOLD: 1_200_000_000, // 120% in 9 decimal precision
    STABILITY_FEE: 20_000_000, // 2% in 9 decimal precision
    LIQUIDATION_PENALTY: 130_000_000, // 13% in 9 decimal precision
    DECIMALS: 9,
} as const;

// Transaction block configuration
export const TX_CONFIG = {
    gasObjectId: undefined,
    gasBudget: 10_000_000, // 0.01 SUI
} as const;

// Price feed configuration - Real Pyth Network feed IDs
export const PRICE_FEEDS = {
    SUI: {
        feedId: "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", // Real Pyth SUI/USD feed ID
        decimals: 8,
    },
    BTC: {
        feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // Pyth BTC/USD feed ID
        decimals: 8,
    },
    ETH: {
        feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // Pyth ETH/USD feed ID
        decimals: 8,
    },
    USD_CHF: {
        feedId: "0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1", // Real Pyth USD/CHF feed ID (we'll convert to CHF/USD)
        decimals: 5,
    },
} as const;

// Collateral types supported
export const COLLATERAL_TYPES = {
    SUI: {
        name: "SUI",
        symbol: "SUI",
        decimals: 9,
        minRatio: 1_500_000_000, // 150%
        liquidationThreshold: 1_200_000_000, // 120%
        debtCeiling: 1_000_000_000_000_000, // 1M ALP
    },
} as const;

// Helper functions
export const formatAmount = (
    amount: bigint | number,
    decimals: number = ALP_CONSTANTS.DECIMALS
): string => {
    const factor = BigInt(10 ** decimals);
    const value = BigInt(amount);
    const whole = value / factor;
    const fractional = value % factor;
    return `${whole}.${fractional.toString().padStart(decimals, "0")}`;
};

export const parseAmount = (
    amount: string,
    decimals: number = ALP_CONSTANTS.DECIMALS
): bigint => {
    // Handle both comma and dot as decimal separators
    const normalizedAmount = amount.replace(",", ".");
    const [whole, fractional = ""] = normalizedAmount.split(".");
    const wholeBigInt = BigInt(whole || "0");
    const fractionalPadded = fractional
        .padEnd(decimals, "0")
        .slice(0, decimals);
    const fractionalBigInt = BigInt(fractionalPadded);
    return wholeBigInt * BigInt(10 ** decimals) + fractionalBigInt;
};

// Calculate collateral ratio
export const calculateCollateralRatio = (
    collateralValue: bigint,
    alpAmount: bigint
): number => {
    if (alpAmount === 0n) return 0;
    return Number((collateralValue * 1000n) / alpAmount) / 10; // Return as percentage
};

// Calculate liquidation price
export const calculateLiquidationPrice = (
    collateralAmount: bigint,
    alpAmount: bigint,
    liquidationRatio: bigint = BigInt(ALP_CONSTANTS.LIQUIDATION_THRESHOLD)
): bigint => {
    if (collateralAmount === 0n) return 0n;
    return (alpAmount * liquidationRatio) / (collateralAmount * 1_000_000_000n);
};
