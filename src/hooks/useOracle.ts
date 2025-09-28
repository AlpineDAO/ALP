import { useState, useEffect, useCallback } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { CONTRACT_ADDRESSES, PRICE_FEEDS } from "../config/sui";
import { SuiObjectResponse } from "@mysten/sui.js/client";

export interface PriceData {
    price: number;
    confidence: number;
    publishTime: number;
    expo: number;
    isStale: boolean;
}

export interface OraclePrice {
    sui: PriceData | null;
    chf: PriceData | null;
}

const PRICE_STALENESS_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export const useOracle = () => {
    const suiClient = useSuiClient();
    const [prices, setPrices] = useState<OraclePrice>({ sui: null, chf: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch real-time price from Pyth Network
    const fetchPythPrice = useCallback(
        async (feedId: string): Promise<PriceData | null> => {
            try {
                // Use Pyth's HTTPS API for real-time price data
                const response = await fetch(
                    `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${feedId}`
                );

                if (!response.ok) {
                    throw new Error(`Pyth API error: ${response.status}`);
                }

                const data = await response.json();

                if (data && data.length > 0) {
                    const priceData = data[0];
                    const price = priceData.price;

                    // Pyth returns price with expo (e.g., price = 185000000, expo = -8 means $1.85)
                    const actualPrice =
                        Number(price.price) * Math.pow(10, price.expo);

                    return {
                        price: actualPrice,
                        confidence:
                            Number(price.conf) * Math.pow(10, price.expo),
                        publishTime: priceData.publish_time * 1000, // Convert to milliseconds
                        expo: price.expo,
                        isStale:
                            Date.now() - priceData.publish_time * 1000 >
                            PRICE_STALENESS_THRESHOLD,
                    };
                }
            } catch (err) {
                console.error("Error fetching Pyth price:", err);
                return null;
            }

            return null;
        },
        []
    );

    // Fallback: Fetch collateral config price (for comparison)
    const fetchCollateralPrice = useCallback(
        async (collateralConfigId: string) => {
            if (!suiClient) return null;

            try {
                const response = await suiClient.getObject({
                    id: collateralConfigId,
                    options: { showContent: true },
                });

                if (
                    response.data?.content &&
                    "fields" in response.data.content
                ) {
                    const fields = response.data.content.fields as any;
                    const priceFeed = fields.price_feed.fields;

                    return {
                        price: Number(priceFeed.price) / 1_000_000_000, // Convert from 9 decimal precision
                        confidence: 0, // Not stored in CollateralConfig
                        publishTime: Number(priceFeed.timestamp),
                        expo: 9,
                        isStale:
                            Date.now() - Number(priceFeed.timestamp) >
                            PRICE_STALENESS_THRESHOLD,
                    };
                }
            } catch (err) {
                console.error("Error fetching collateral price:", err);
                return null;
            }

            return null;
        },
        [suiClient]
    );

    // Fetch oracle state to get additional information
    const fetchOracleState = useCallback(async () => {
        if (!suiClient) return null;

        try {
            const response = await suiClient.getObject({
                id: CONTRACT_ADDRESSES.ORACLE_STATE,
                options: { showContent: true },
            });

            if (response.data?.content && "fields" in response.data.content) {
                const fields = response.data.content.fields as any;

                return {
                    pythStateId: fields.pyth_state_id,
                    wormholeStateId: fields.wormhole_state_id,
                    paused: fields.paused,
                    authorizedUpdaters: fields.authorized_updaters,
                };
            }
        } catch (err) {
            console.error("Error fetching oracle state:", err);
            return null;
        }

        return null;
    }, [suiClient]);

    // Fetch CHF/USD rate from Pyth Network (using USD/CHF and converting)
    const fetchChfUsdRate = useCallback(async (): Promise<PriceData | null> => {
        try {
            // First try to get USD/CHF from Pyth Network
            const usdChfPrice = await fetchPythPrice(
                PRICE_FEEDS.USD_CHF.feedId
            );

            if (usdChfPrice && usdChfPrice.price > 0) {
                // Convert USD/CHF to CHF/USD (inverse)
                const chfUsdRate = 1 / usdChfPrice.price;

                return {
                    price: chfUsdRate,
                    confidence:
                        usdChfPrice.confidence /
                        (usdChfPrice.price * usdChfPrice.price), // Error propagation for inverse
                    publishTime: usdChfPrice.publishTime,
                    expo: -usdChfPrice.expo, // Inverse of the exponent
                    isStale: usdChfPrice.isStale,
                };
            }
        } catch (err) {
            console.error("Error fetching CHF/USD rate from Pyth:", err);
        }

        // Fallback to external API if Pyth fails
        try {
            const response = await fetch(
                "https://api.exchangerate-api.com/v4/latest/CHF"
            );
            const data = await response.json();

            if (data && data.rates && data.rates.USD) {
                return {
                    price: data.rates.USD,
                    confidence: 0,
                    publishTime: Date.now(),
                    expo: 0,
                    isStale: false,
                };
            }
        } catch (err) {
            console.error("Error fetching CHF/USD rate from API:", err);
        }

        // Final fallback to approximate rate
        return {
            price: 1.1, // Approximate CHF/USD rate
            confidence: 0,
            publishTime: Date.now(),
            expo: 0,
            isStale: true, // Mark as stale since it's a fallback
        };
    }, [fetchPythPrice]);

    // Main function to fetch all prices
    const fetchPrices = useCallback(async () => {
        if (!suiClient) return;

        setLoading(true);
        setError(null);

        try {
            // Prioritize contract price over external Pyth price
            const suiContractPrice = await fetchCollateralPrice(
                CONTRACT_ADDRESSES.SUI_COLLATERAL_CONFIG
            );

            // Fallback to Pyth price if contract price fails
            const suiPythPrice = suiContractPrice
                ? null
                : await fetchPythPrice(PRICE_FEEDS.SUI.feedId);

            // Use contract price if available, otherwise fallback to Pyth
            const suiPrice = suiContractPrice || suiPythPrice;

            // Fetch CHF/USD rate
            const chfPrice = await fetchChfUsdRate();

            setPrices({
                sui: suiPrice,
                chf: chfPrice,
            });

            // Log the source of data for debugging
            console.log("🔍 Price sources:", {
                sui: suiContractPrice ? "Contract (PRIMARY)" : "Pyth Network (FALLBACK)",
                chf:
                    chfPrice?.isStale === false
                        ? "Pyth Network (LIVE)"
                        : "External API/Fallback",
                prices: {
                    suiUsd: suiPrice?.price,
                    chfUsd: chfPrice?.price,
                },
                timestamps: {
                    sui: new Date(suiPrice?.publishTime || 0).toLocaleString(),
                    chf: new Date(chfPrice?.publishTime || 0).toLocaleString(),
                },
                staleness: {
                    sui: suiPrice?.isStale,
                    chf: chfPrice?.isStale,
                }
            });
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : "Failed to fetch prices";
            setError(errorMessage);
            console.error("Error fetching oracle prices:", err);
        } finally {
            setLoading(false);
        }
    }, [suiClient, fetchPythPrice, fetchCollateralPrice, fetchChfUsdRate]);

    // Auto-fetch prices on initialization and set up periodic updates
    useEffect(() => {
        if (suiClient) {
            fetchPrices();

            // Set up periodic price updates (every 30 seconds)
            const interval = setInterval(fetchPrices, 30_000);

            return () => clearInterval(interval);
        }
    }, [suiClient, fetchPrices]);

    // Helper function to get SUI price in USD - prioritize contract price
    const getSuiPriceUsd = useCallback((): number => {
        // Always try to use the most recent price data available
        if (prices.sui) {
            console.log("🔍 Using SUI price from oracle:", prices.sui.price, "stale:", prices.sui.isStale);
            return prices.sui.price;
        }

        // Fallback to a reasonable default if oracle data is unavailable
        console.warn(
            "Using fallback SUI price - oracle data unavailable"
        );
        return 1.85; // Fallback SUI price
    }, [prices.sui]);

    // Helper function to get CHF to USD conversion rate
    const getChfToUsdRate = useCallback((): number => {
        if (prices.chf && !prices.chf.isStale) {
            return prices.chf.price;
        }

        // Fallback rate
        console.warn("Using fallback CHF/USD rate - data unavailable or stale");
        return 1.1; // Fallback CHF/USD rate
    }, [prices.chf]);

    // Calculate USD value of collateral
    const calculateCollateralValueUsd = useCallback(
        (collateralAmount: bigint, collateralType: string = "SUI"): number => {
            const amount = Number(collateralAmount) / 1_000_000_000; // Convert from lamports

            if (collateralType === "SUI") {
                return amount * getSuiPriceUsd();
            }

            // Add support for other collateral types here
            return 0;
        },
        [getSuiPriceUsd]
    );

    // Calculate USD value of ALP debt
    const calculateAlpDebtUsd = useCallback(
        (alpAmount: bigint): number => {
            const amount = Number(alpAmount) / 1_000_000_000; // Convert from lamports
            return amount * getChfToUsdRate(); // ALP is pegged to CHF
        },
        [getChfToUsdRate]
    );

    return {
        prices,
        loading,
        error,
        fetchPrices,
        getSuiPriceUsd,
        getChfToUsdRate,
        calculateCollateralValueUsd,
        calculateAlpDebtUsd,
        fetchOracleState,
    };
};
