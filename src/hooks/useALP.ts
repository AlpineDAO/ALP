import { useState, useEffect, useCallback } from "react";
import {
    useCurrentAccount,
    useSuiClient,
    useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SuiObjectResponse, SuiObjectData } from "@mysten/sui.js/client";
import {
    CONTRACT_ADDRESSES,
    ALP_CONSTANTS,
    formatAmount,
    parseAmount,
    calculateCollateralRatio,
} from "../config/sui";

// Types for ALP protocol data
export interface CollateralPosition {
    id: string;
    owner: string;
    collateralAmount: bigint;
    alpMinted: bigint;
    collateralType: string;
    lastUpdate: number;
    accumulatedFee: bigint;
    collateralRatio?: number;
}

export interface ProtocolState {
    totalAlpSupply: bigint;
    totalCollateralValue: bigint;
    globalCollateralRatio: number;
    minCollateralRatio: number;
    liquidationThreshold: number;
    stabilityFee: number;
    liquidationPenalty: number;
    paused: boolean;
}

export interface CollateralConfig {
    name: string;
    minRatio: bigint;
    liquidationThreshold: bigint;
    debtCeiling: bigint;
    currentDebt: bigint;
    active: boolean;
    priceUsd: bigint;
}

// Custom hook for ALP protocol interactions
export const useALP = () => {
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutate: signAndExecuteTransaction } =
        useSignAndExecuteTransaction();

    const [protocolState, setProtocolState] = useState<ProtocolState | null>(
        null
    );
    const [userPositions, setUserPositions] = useState<CollateralPosition[]>(
        []
    );
    const [collateralConfigs, setCollateralConfigs] = useState<
        Record<string, CollateralConfig>
    >({});
    const [alpBalance, setAlpBalance] = useState<bigint>(0n);
    const [suiBalance, setSuiBalance] = useState<bigint>(0n);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Demo mode for testing (can be toggled via URL parameter only)
    const isDemoMode =
        typeof window !== "undefined" &&
        window.location.search.includes("demo=true");

    // Mock positions for demo mode
    const mockPositions: CollateralPosition[] = [
        {
            id: "0x1234567890abcdef1234567890abcdef12345678",
            owner: currentAccount?.address || "0x0",
            collateralAmount: BigInt(10_000_000_000_000), // 10,000 SUI
            alpMinted: BigInt(5_882_352_941_176), // ~5,882 ALP (health factor ~1.7)
            collateralType: "SUI",
            lastUpdate: Date.now(),
            accumulatedFee: BigInt(0),
            collateralRatio: 170,
        },
    ];

    // Fetch protocol state
    const fetchProtocolState = useCallback(async () => {
        if (!suiClient) return;

        try {
            const response = await suiClient.getObject({
                id: CONTRACT_ADDRESSES.PROTOCOL_STATE,
                options: { showContent: true },
            });

            if (response.data?.content && "fields" in response.data.content) {
                const fields = response.data.content.fields as any;
                setProtocolState({
                    totalAlpSupply: BigInt(fields.total_alp_supply),
                    totalCollateralValue: BigInt(fields.total_collateral_value),
                    globalCollateralRatio:
                        Number(fields.global_collateral_ratio) / 10_000_000, // Convert to percentage
                    minCollateralRatio:
                        Number(fields.min_collateral_ratio) / 10_000_000,
                    liquidationThreshold:
                        Number(fields.liquidation_threshold) / 10_000_000,
                    stabilityFee: Number(fields.stability_fee) / 10_000_000,
                    liquidationPenalty:
                        Number(fields.liquidation_penalty) / 10_000_000,
                    paused: fields.paused,
                });
            }
        } catch (err) {
            console.error("Error fetching protocol state:", err);
            setError("Failed to fetch protocol state");
        }
    }, [suiClient]);

    // Fetch user positions
    const fetchUserPositions = useCallback(async () => {
        if (!currentAccount?.address || !suiClient) return;

        // Use mock data in demo mode
        if (isDemoMode) {
            setUserPositions(mockPositions);
            return;
        }

        try {
            console.log("Fetching positions for:", currentAccount.address);
            console.log("Looking for contract:", CONTRACT_ADDRESSES.PACKAGE_ID);

            // Try both with specific type filter and without filter to debug
            const response = await suiClient.getOwnedObjects({
                owner: currentAccount.address,
                filter: {
                    StructType: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::CollateralPosition`,
                },
                options: { showContent: true, showType: true },
            });

            // Also get all objects to see what's there
            const allObjects = await suiClient.getOwnedObjects({
                owner: currentAccount.address,
                options: { showContent: true, showType: true },
            });

            console.log("All owned objects:", allObjects.data.length);
            console.log(
                "Objects with ALP package:",
                allObjects.data.filter((obj) =>
                    obj.data?.type?.includes(CONTRACT_ADDRESSES.PACKAGE_ID)
                )
            );

            console.log("Raw response:", response);

            const positions: CollateralPosition[] = [];
            for (const obj of response.data) {
                if (obj.data?.content && "fields" in obj.data.content) {
                    // Verify this is from the current contract package
                    console.log("Checking position type:", {
                        objectId: obj.data.objectId,
                        type: obj.data.type,
                        expectedPackage: CONTRACT_ADDRESSES.PACKAGE_ID,
                        startsWith: obj.data.type?.startsWith(
                            CONTRACT_ADDRESSES.PACKAGE_ID
                        ),
                    });

                    if (
                        !obj.data.type?.startsWith(
                            CONTRACT_ADDRESSES.PACKAGE_ID
                        )
                    ) {
                        console.log(
                            `Skipping position from old contract: ${obj.data.objectId}`
                        );
                        continue;
                    }

                    const fields = obj.data.content.fields as any;
                    const collateralAmount = BigInt(fields.collateral_amount);
                    const alpMinted = BigInt(fields.alp_minted);

                    // Convert collateral_type from ASCII array to string
                    const collateralType = Array.isArray(fields.collateral_type)
                        ? String.fromCharCode(...fields.collateral_type)
                        : fields.collateral_type;

                    console.log("Position found:", {
                        id: obj.data.objectId,
                        collateralAmount: collateralAmount.toString(),
                        alpMinted: alpMinted.toString(),
                        collateralType,
                        rawCollateralType: fields.collateral_type,
                    });

                    // Calculate collateral ratio (simplified - would need actual price data)
                    const collateralRatio =
                        (Number(collateralAmount) / Number(alpMinted)) * 100; // Simplified calculation

                    positions.push({
                        id: obj.data.objectId,
                        owner: fields.owner,
                        collateralAmount,
                        alpMinted,
                        collateralType,
                        lastUpdate: Number(fields.last_update),
                        accumulatedFee: BigInt(fields.accumulated_fee),
                        collateralRatio,
                    });
                }
            }

            console.log("Final positions:", positions);
            setUserPositions(positions);
        } catch (err) {
            console.error("Error fetching user positions:", err);
            setError("Failed to fetch user positions");
        }
    }, [currentAccount?.address, suiClient]);

    // Fetch user balances
    const fetchUserBalances = useCallback(async () => {
        if (!currentAccount?.address || !suiClient) return;

        try {
            // Fetch ALP balance
            const alpCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: CONTRACT_ADDRESSES.ALP_COIN_TYPE,
            });

            const totalAlp = alpCoins.data.reduce(
                (sum, coin) => sum + BigInt(coin.balance),
                0n
            );
            setAlpBalance(totalAlp);

            // Fetch SUI balance
            const suiCoins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: "0x2::sui::SUI",
            });

            console.log(
                "SUI coins for address",
                currentAccount.address,
                ":",
                suiCoins.data
            );

            const totalSui = suiCoins.data.reduce(
                (sum, coin) => sum + BigInt(coin.balance),
                0n
            );
            console.log("Total SUI balance:", totalSui.toString());
            setSuiBalance(totalSui);
        } catch (err) {
            console.error("Error fetching balances:", err);
            setError("Failed to fetch balances");
        }
    }, [currentAccount?.address, suiClient]);

    // Create a new position
    const createPosition = useCallback(
        async (collateralAmount: string, alpAmount: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();

                // Get SUI coins for collateral
                const suiCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: "0x2::sui::SUI",
                });

                if (suiCoins.data.length === 0) {
                    throw new Error("No SUI coins available");
                }

                const collateralAmountParsed = parseAmount(collateralAmount);
                const alpAmountParsed = parseAmount(alpAmount);

                // Use the first SUI coin as collateral
                const collateralCoin = tx.object(suiCoins.data[0].coinObjectId);

                // Call create_position function
                tx.moveCall({
                    target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::create_position`,
                    typeArguments: ["0x2::sui::SUI"],
                    arguments: [
                        tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
                        collateralCoin,
                        tx.pure.u64(alpAmountParsed.toString()),
                    ],
                });

                // Execute transaction using the hook
                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        {
                            transaction: tx,
                        },
                        {
                            onSuccess: async (result) => {
                                // Refresh data
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                reject(error);
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    // Add collateral to existing position
    const addCollateral = useCallback(
        async (positionId: string, collateralAmount: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();

                // Get SUI coins for additional collateral
                const suiCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: "0x2::sui::SUI",
                });

                if (suiCoins.data.length === 0) {
                    throw new Error("No SUI coins available");
                }

                const collateralAmountParsed = parseAmount(collateralAmount);
                const collateralCoin = tx.object(suiCoins.data[0].coinObjectId);

                // Call add_collateral function
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

                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        {
                            transaction: tx,
                        },
                        {
                            onSuccess: async (result) => {
                                // Refresh data
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                reject(error);
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    // Mint additional ALP against existing position
    const mintAlp = useCallback(
        async (positionId: string, alpAmount: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();
                const alpAmountParsed = parseAmount(alpAmount);

                // Call mint_alp function
                tx.moveCall({
                    target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::mint_alp`,
                    arguments: [
                        tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                        tx.object(positionId),
                        tx.pure.u64(alpAmountParsed.toString()),
                    ],
                });

                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        {
                            transaction: tx,
                        },
                        {
                            onSuccess: async (result) => {
                                // Refresh data
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                reject(error);
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    const burnAlp = useCallback(
        async (positionId: string, alpAmount: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();
                const alpAmountParsed = parseAmount(alpAmount);

                // Get SUI coins for gas
                const suiCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: "0x2::sui::SUI",
                });

                if (suiCoins.data.length === 0) {
                    throw new Error("No SUI coins available for gas");
                }

                // Set gas payment with the largest SUI coin
                const largestSuiCoin = suiCoins.data.reduce((largest, coin) =>
                    BigInt(coin.balance) > BigInt(largest.balance) ? coin : largest
                );

                tx.setGasPayment([{
                    objectId: largestSuiCoin.coinObjectId,
                    version: largestSuiCoin.version,
                    digest: largestSuiCoin.digest
                }]);

                // Get ALP coins to burn
                const alpCoins = await suiClient.getCoins({
                    owner: currentAccount.address,
                    coinType: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::ALP`,
                });

                if (alpCoins.data.length === 0) {
                    throw new Error("No ALP coins available to burn");
                }

                // Check total ALP balance
                const totalAlpBalance = alpCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
                if (totalAlpBalance < alpAmountParsed) {
                    throw new Error(`Insufficient ALP balance. Need: ${formatAmount(alpAmountParsed)} ALP, Have: ${formatAmount(totalAlpBalance)} ALP`);
                }

                // Merge all ALP coins if there are multiple
                let mainAlpCoin = tx.object(alpCoins.data[0].coinObjectId);
                if (alpCoins.data.length > 1) {
                    // Merge all other coins into the first one
                    const otherCoins = alpCoins.data.slice(1).map(coin => tx.object(coin.coinObjectId));
                    tx.mergeCoins(mainAlpCoin, otherCoins);
                }

                // Split the exact ALP amount to burn
                const [alpCoin] = tx.splitCoins(mainAlpCoin, [alpAmountParsed]);

                // Call burn_alp function
                tx.moveCall({
                    target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::burn_alp`,
                    arguments: [
                        tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                        tx.object(positionId),
                        alpCoin,
                    ],
                });

                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        {
                            transaction: tx,
                        },
                        {
                            onSuccess: async (result) => {
                                // Refresh data
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                reject(error);
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    // Withdraw all collateral from position (requires zero debt)
    const withdrawAllCollateral = useCallback(
        async (positionId: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();

                // Call withdraw_collateral
                tx.moveCall({
                    target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::withdraw_collateral`,
                    typeArguments: ["0x2::sui::SUI"],
                    arguments: [
                        tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
                        tx.object(positionId),
                    ],
                });

                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        { transaction: tx },
                        {
                            onSuccess: async (result) => {
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                const errorMessage =
                                    error?.message ||
                                    "Failed to withdraw collateral";
                                setError(errorMessage);
                                reject(new Error(errorMessage));
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            signAndExecuteTransaction,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    // Withdraw partial collateral from position
    const withdrawPartialCollateral = useCallback(
        async (positionId: string, withdrawAmount: string) => {
            if (!currentAccount?.address || !suiClient) {
                throw new Error("Wallet not connected");
            }

            setLoading(true);
            setError(null);

            try {
                const tx = new Transaction();
                const withdrawAmountParsed = parseAmount(withdrawAmount);

                // Call withdraw_partial_collateral
                tx.moveCall({
                    target: `${CONTRACT_ADDRESSES.PACKAGE_ID}::alp::withdraw_partial_collateral`,
                    typeArguments: ["0x2::sui::SUI"],
                    arguments: [
                        tx.object(CONTRACT_ADDRESSES.PROTOCOL_STATE),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG),
                        tx.object(CONTRACT_ADDRESSES.SUI_COLLATERAL_VAULT),
                        tx.object(positionId),
                        tx.pure.u64(withdrawAmountParsed.toString()),
                    ],
                });

                return new Promise((resolve, reject) => {
                    signAndExecuteTransaction(
                        { transaction: tx },
                        {
                            onSuccess: async (result) => {
                                await Promise.all([
                                    fetchProtocolState(),
                                    fetchUserPositions(),
                                    fetchUserBalances(),
                                ]);
                                resolve(result);
                            },
                            onError: (error) => {
                                const errorMessage =
                                    error?.message ||
                                    "Failed to withdraw partial collateral";
                                setError(errorMessage);
                                reject(new Error(errorMessage));
                            },
                        }
                    );
                });
            } catch (err) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred";
                setError(errorMessage);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [
            currentAccount,
            suiClient,
            signAndExecuteTransaction,
            fetchProtocolState,
            fetchUserPositions,
            fetchUserBalances,
        ]
    );

    // Initialize data fetching
    useEffect(() => {
        if (currentAccount?.address) {
            Promise.all([
                fetchProtocolState(),
                fetchUserPositions(),
                fetchUserBalances(),
            ]);
        }
    }, [
        currentAccount?.address,
        fetchProtocolState,
        fetchUserPositions,
        fetchUserBalances,
    ]);

    return {
        // State
        protocolState,
        userPositions,
        collateralConfigs,
        alpBalance,
        suiBalance,
        loading,
        error,

        // Actions
        createPosition,
        addCollateral,
        mintAlp,
        burnAlp,
        withdrawAllCollateral,
        withdrawPartialCollateral,

        // Utils
        formatAmount,
        parseAmount,
        calculateCollateralRatio,

        // Refresh functions
        refreshData: () =>
            Promise.all([
                fetchProtocolState(),
                fetchUserPositions(),
                fetchUserBalances(),
            ]),
    };
};
