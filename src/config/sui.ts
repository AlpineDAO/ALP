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
export const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

// Contract addresses - Updated with deployed contract addresses
export const CONTRACT_ADDRESSES = {
    // Deployed package and contract addresses
    PACKAGE_ID:
        "0xc9e0410bd6a360b0676d325034cddb021135cf0af205318e31569a1aaa9dd6c6",
    ALP_COIN_TYPE:
        "0xc9e0410bd6a360b0676d325034cddb021135cf0af205318e31569a1aaa9dd6c6::alp::ALP",
    PROTOCOL_STATE:
        "0x9b68e3fb90da406a4ac767d2304ef742cdd6c0dce67e39df865b1e33e578e88a",
    ORACLE_STATE:
        "0x69c8679559fd8203ad936c8b820af80d35643e3e86c72f3e23615c60d6e4979b",
    ORACLE_MANAGER_CAP:
        "0xee6491c6a4d446bf87f6de941e7f21b3f3addd9e552d1a7285665ded24c47ad3",
    LIQUIDATION_MANAGER_CAP:
        "0xc686f14ce356a243d8e6ee38560794aa07e19ee9b6d4a5aee53115a21e11b0d1",
    UPGRADE_CAP:
        "0x2af5e5c4e67877ce026213ad3c1762a82db96c745a90a5fa7ba3eb22ca2675f2",
    ALP_COIN_METADATA:
        "0x803cb4f24315b4fbaa0604479f134cb71cc4fc624a70626af1ee3e38ff4d0823",
    // Collateral configurations (you'll create these for each collateral type)
    SUI_COLLATERAL_CONFIG:
        "0xe6208a18345e338738c51fbad3fccf796d59258b26422bfaf27986cd3ae53ffa",
    SUI_COLLATERAL_VAULT:
        "0xca9c74ca16a1821e4640e1f10a5151ea026a92a4d3dae966b78632e00a76c9c1",
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
    const [whole, fractional = ""] = amount.split(".");
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
