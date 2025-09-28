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

// Contract addresses - Updated with FIXED LIQUIDATION deployed contract addresses (FINAL DEPLOYMENT)
export const CONTRACT_ADDRESSES = {
    // FIXED LIQUIDATION CONTRACT DEPLOYMENT - September 2025 (burn_alp_liquidation fixed)
    PACKAGE_ID:
        "0x0bffadedec4f9e3d0e80062ceb8145a106ffa10e366a8512b12e1735d8e38d75",
    ALP_COIN_TYPE:
        "0x0bffadedec4f9e3d0e80062ceb8145a106ffa10e366a8512b12e1735d8e38d75::alp::ALP",
    PROTOCOL_STATE:
        "0x0a1f972c7d3f3d78cef01c74005957e8739975caf1425f9f1faab64ce260ba3c",
    ORACLE_STATE:
        "0xd5b06fad399a3e9b5e6c7aef16991fdbb52bd6a154a30bb556b5fa5f1c1bf032",
    ORACLE_MANAGER_CAP:
        "0xacd7d47a431070f0d53713175795b1383f84dc54e333995d8fc1ebf3005843b5",
    LIQUIDATION_MANAGER_CAP:
        "0x675031d28f9fb61fc058beec9ab8a6f475a8485f75eab4d9da5779047196398b",
    UPGRADE_CAP:
        "0xabb289a190436d568a0fb5c8568b6a50d24ac1ee250a0b95623a326fbb983147",
    ALP_COIN_METADATA:
        "0x5bef690d4836774fed8821e659af97c97765c7791ce8db6f0f24b6c5858f22fb",
    // Collateral configurations (CREATED for final deployment)
    SUI_COLLATERAL_CONFIG:
        "0x71adb8af6e2d7294b90a7736f6ac7d64fc1766171092a6dd87f6b23943a39ab2",
    SUI_COLLATERAL_VAULT:
        "0xab64f4fded05f727bbe9c47f2f4762a9ccff89aa652d5efc9cef9bc6f4ab5237",
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
