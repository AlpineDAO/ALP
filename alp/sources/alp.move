/// ALP Stablecoin - Algorithmic stablecoin pegged to CHF
/// Inspired by DAI and Bucket Protocol but built for Sui
module alp::alp {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::event;
    use std::option::{Self, Option};

    // ======== Constants ========
    
    /// The CHF peg target (1 ALP = 1 CHF in USD terms)
    const CHF_PEG_TARGET: u64 = 1_000_000_000; // 1 CHF in 9 decimal precision
    
    /// Minimum collateralization ratio (150%)
    const MIN_COLLATERAL_RATIO: u64 = 1_500_000_000; // 150% in 9 decimal precision
    
    /// Liquidation threshold (120%)
    const LIQUIDATION_THRESHOLD: u64 = 1_200_000_000; // 120% in 9 decimal precision
    
    /// Stability fee (annual) - 2%
    const STABILITY_FEE: u64 = 20_000_000; // 2% in 9 decimal precision
    
    /// Liquidation penalty (13%)
    const LIQUIDATION_PENALTY: u64 = 130_000_000; // 13% in 9 decimal precision

    // ======== Error codes ========
    
    const EInsufficientCollateral: u64 = 1;
    const EInsufficientALP: u64 = 2;
    const EPositionNotLiquidatable: u64 = 3;
    const EInvalidAmount: u64 = 4;
    const EPriceStale: u64 = 5;
    const EUnauthorized: u64 = 6;

    // ======== Structs ========
    
    /// The ALP coin type
    public struct ALP has drop {}
    
    /// Collateral Deposit Position
    public struct CollateralPosition has key, store {
        id: UID,
        /// Owner of this position
        owner: address,
        /// Amount of collateral deposited (in collateral token units)
        collateral_amount: u64,
        /// Amount of ALP minted against this collateral
        alp_minted: u64,
        /// Type of collateral (e.g., "SUI", "BTC")
        collateral_type: vector<u8>,
        /// Timestamp of last update
        last_update: u64,
        /// Accumulated stability fee
        accumulated_fee: u64,
    }
    
    /// Global state of the ALP protocol
    public struct ProtocolState has key {
        id: UID,
        /// Treasury capability for minting/burning ALP
        treasury_cap: TreasuryCap<ALP>,
        /// Total ALP in circulation
        total_alp_supply: u64,
        /// Total collateral value locked (in USD terms)
        total_collateral_value: u64,
        /// Global collateralization ratio
        global_collateral_ratio: u64,
        /// Protocol parameters
        min_collateral_ratio: u64,
        liquidation_threshold: u64,
        stability_fee: u64,
        liquidation_penalty: u64,
        /// Admin capability
        admin: address,
        /// Emergency pause flag
        paused: bool,
    }
    
    /// Price feed information
    public struct PriceFeed has store {
        /// Price in USD (9 decimal places)
        price: u64,
        /// Timestamp of last update
        timestamp: u64,
        /// Price feed ID from Pyth
        feed_id: vector<u8>,
    }
    
    /// Collateral type configuration
    public struct CollateralConfig has key, store {
        id: UID,
        /// Collateral type name
        name: vector<u8>,
        /// Minimum collateralization ratio for this collateral
        min_ratio: u64,
        /// Liquidation threshold for this collateral
        liquidation_threshold: u64,
        /// Maximum debt ceiling for this collateral type
        debt_ceiling: u64,
        /// Current debt amount
        current_debt: u64,
        /// Price feed for this collateral
        price_feed: PriceFeed,
        /// Whether this collateral is active
        active: bool,
    }

    // ======== Events ========
    
    public struct PositionCreated has copy, drop {
        position_id: address,
        owner: address,
        collateral_amount: u64,
        alp_minted: u64,
        collateral_type: vector<u8>,
    }
    
    public struct PositionUpdated has copy, drop {
        position_id: address,
        owner: address,
        collateral_amount: u64,
        alp_minted: u64,
        action: vector<u8>, // "mint", "burn", "deposit", "withdraw"
    }
    
    public struct PositionLiquidated has copy, drop {
        position_id: address,
        owner: address,
        liquidator: address,
        collateral_liquidated: u64,
        alp_burned: u64,
        penalty: u64,
    }
    
    public struct PriceUpdated has copy, drop {
        collateral_type: vector<u8>,
        old_price: u64,
        new_price: u64,
        timestamp: u64,
    }

    // ======== Init Function ========
    /// Initialize the ALP stablecoin protocol
    fun init(witness: ALP, ctx: &mut TxContext) {
        // Create the treasury capability and coin metadata
        let (treasury_cap, metadata) = coin::create_currency<ALP>(
            witness,
            9, // decimals
            b"ALP",
            b"Alpine Stablecoin",
            b"Algorithmic stablecoin pegged to Swiss Franc (CHF) on Sui",
            option::none(),
            ctx
        );
        
        // Transfer the metadata to the sender
        transfer::public_freeze_object(metadata);
        
        // Create the protocol state
        let protocol_state = ProtocolState {
            id: object::new(ctx),
            treasury_cap,
            total_alp_supply: 0,
            total_collateral_value: 0,
            global_collateral_ratio: 0,
            min_collateral_ratio: MIN_COLLATERAL_RATIO,
            liquidation_threshold: LIQUIDATION_THRESHOLD,
            stability_fee: STABILITY_FEE,
            liquidation_penalty: LIQUIDATION_PENALTY,
            admin: tx_context::sender(ctx),
            paused: false,
        };
        
        // Share the protocol state
        transfer::share_object(protocol_state);
    }

    // ======== Public Entry Functions ========
    
    /// Create a new collateral position and mint ALP
    public entry fun create_position<T>(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        collateral: Coin<T>,
        alp_amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(collateral_config.active, EUnauthorized);
        assert!(alp_amount > 0, EInvalidAmount);
        
        let collateral_amount = coin::value(&collateral);
        assert!(collateral_amount > 0, EInvalidAmount);
        
        // Calculate collateral value in USD
        let collateral_value = calculate_collateral_value(collateral_amount, &collateral_config.price_feed);
        
        // Calculate required collateral ratio
        let required_collateral = (alp_amount * collateral_config.min_ratio) / 1_000_000_000;
        assert!(collateral_value >= required_collateral, EInsufficientCollateral);
        
        // Check debt ceiling
        assert!(collateral_config.current_debt + alp_amount <= collateral_config.debt_ceiling, EInsufficientCollateral);
        
        // Create the position
        let position = CollateralPosition {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            collateral_amount,
            alp_minted: alp_amount,
            collateral_type: collateral_config.name,
            last_update: tx_context::epoch_timestamp_ms(ctx),
            accumulated_fee: 0,
        };
        
        let position_id = object::uid_to_address(&position.id);
        
        // Mint ALP tokens
        let alp_coins = coin::mint(&mut protocol_state.treasury_cap, alp_amount, ctx);
        
        // Update protocol state
        protocol_state.total_alp_supply = protocol_state.total_alp_supply + alp_amount;
        protocol_state.total_collateral_value = protocol_state.total_collateral_value + collateral_value;
        collateral_config.current_debt = collateral_config.current_debt + alp_amount;
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (protocol_state.total_collateral_value * 1_000_000_000) / protocol_state.total_alp_supply;
        };
        
        // Transfer collateral to protocol (in a real implementation, this would be held in escrow)
        transfer::public_transfer(collateral, @alp);
        
        // Transfer ALP to user
        transfer::public_transfer(alp_coins, tx_context::sender(ctx));
        
        // Transfer position to user
        transfer::transfer(position, tx_context::sender(ctx));
        
        // Emit event
        event::emit(PositionCreated {
            position_id,
            owner: tx_context::sender(ctx),
            collateral_amount,
            alp_minted: alp_amount,
            collateral_type: collateral_config.name,
        });
    }
    
    /// Add more collateral to an existing position
    public entry fun add_collateral<T>(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        position: &mut CollateralPosition,
        collateral: Coin<T>,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(position.owner == tx_context::sender(ctx), EUnauthorized);
        
        let collateral_amount = coin::value(&collateral);
        assert!(collateral_amount > 0, EInvalidAmount);
        
        // Calculate additional collateral value
        let additional_value = calculate_collateral_value(collateral_amount, &collateral_config.price_feed);
        
        // Update position
        position.collateral_amount = position.collateral_amount + collateral_amount;
        position.last_update = tx_context::epoch_timestamp_ms(ctx);
        
        // Update protocol state
        protocol_state.total_collateral_value = protocol_state.total_collateral_value + additional_value;
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (protocol_state.total_collateral_value * 1_000_000_000) / protocol_state.total_alp_supply;
        };
        
        // Transfer collateral to protocol
        transfer::public_transfer(collateral, @alp);
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: position.collateral_amount,
            alp_minted: position.alp_minted,
            action: b"deposit",
        });
    }
    
    /// Mint additional ALP against existing collateral
    public entry fun mint_alp(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        position: &mut CollateralPosition,
        alp_amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(position.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(alp_amount > 0, EInvalidAmount);
        
        // Calculate current collateral value
        let collateral_value = calculate_collateral_value(position.collateral_amount, &collateral_config.price_feed);
        
        // Calculate new total ALP debt
        let new_alp_total = position.alp_minted + alp_amount;
        
        // Check collateralization ratio
        let required_collateral = (new_alp_total * collateral_config.min_ratio) / 1_000_000_000;
        assert!(collateral_value >= required_collateral, EInsufficientCollateral);
        
        // Check debt ceiling
        assert!(collateral_config.current_debt + alp_amount <= collateral_config.debt_ceiling, EInsufficientCollateral);
        
        // Mint ALP tokens
        let alp_coins = coin::mint(&mut protocol_state.treasury_cap, alp_amount, ctx);
        
        // Update position
        position.alp_minted = new_alp_total;
        position.last_update = tx_context::epoch_timestamp_ms(ctx);
        
        // Update protocol state
        protocol_state.total_alp_supply = protocol_state.total_alp_supply + alp_amount;
        collateral_config.current_debt = collateral_config.current_debt + alp_amount;
        
        // Update global collateral ratio
        protocol_state.global_collateral_ratio = 
            (protocol_state.total_collateral_value * 1_000_000_000) / protocol_state.total_alp_supply;
        
        // Transfer ALP to user
        transfer::public_transfer(alp_coins, tx_context::sender(ctx));
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: position.collateral_amount,
            alp_minted: position.alp_minted,
            action: b"mint",
        });
    }
    
    /// Burn ALP to reduce debt
    public entry fun burn_alp(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        position: &mut CollateralPosition,
        alp_coins: Coin<ALP>,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(position.owner == tx_context::sender(ctx), EUnauthorized);
        
        let burn_amount = coin::value(&alp_coins);
        assert!(burn_amount > 0, EInvalidAmount);
        assert!(burn_amount <= position.alp_minted, EInsufficientALP);
        
        // Burn the ALP tokens
        coin::burn(&mut protocol_state.treasury_cap, alp_coins);
        
        // Update position
        position.alp_minted = position.alp_minted - burn_amount;
        position.last_update = tx_context::epoch_timestamp_ms(ctx);
        
        // Update protocol state
        protocol_state.total_alp_supply = protocol_state.total_alp_supply - burn_amount;
        collateral_config.current_debt = collateral_config.current_debt - burn_amount;
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (protocol_state.total_collateral_value * 1_000_000_000) / protocol_state.total_alp_supply;
        };
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: position.collateral_amount,
            alp_minted: position.alp_minted,
            action: b"burn",
        });
    }

    // ======== Helper Functions ========
    
    /// Calculate collateral value in USD terms
    fun calculate_collateral_value(amount: u64, price_feed: &PriceFeed): u64 {
        // Convert collateral amount to USD value using price feed
        // This assumes the price feed gives price in USD with 9 decimal places
        (amount * price_feed.price) / 1_000_000_000
    }
    
    /// Calculate health factor for a position
    public fun calculate_health_factor(
        position: &CollateralPosition,
        collateral_config: &CollateralConfig
    ): u64 {
        if (position.alp_minted == 0) {
            return 0xFFFFFFFFFFFFFFFF // Max value for no debt
        };
        
        let collateral_value = calculate_collateral_value(position.collateral_amount, &collateral_config.price_feed);
        (collateral_value * 1_000_000_000) / position.alp_minted
    }
    
    /// Check if a position is liquidatable
    public fun is_liquidatable(
        position: &CollateralPosition,
        collateral_config: &CollateralConfig
    ): bool {
        let health_factor = calculate_health_factor(position, collateral_config);
        health_factor < collateral_config.liquidation_threshold
    }

    // ======== Admin Functions ========
    
    /// Create a new collateral type configuration
    public entry fun create_collateral_config(
        protocol_state: &ProtocolState,
        name: vector<u8>,
        min_ratio: u64,
        liquidation_threshold: u64,
        debt_ceiling: u64,
        price_feed_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(protocol_state.admin == tx_context::sender(ctx), EUnauthorized);
        
        let config = CollateralConfig {
            id: object::new(ctx),
            name,
            min_ratio,
            liquidation_threshold,
            debt_ceiling,
            current_debt: 0,
            price_feed: PriceFeed {
                price: 0,
                timestamp: 0,
                feed_id: price_feed_id,
            },
            active: true,
        };
        
        transfer::share_object(config);
    }
    
    /// Update price feed (to be called by oracle integration)
    public entry fun update_price_feed(
        collateral_config: &mut CollateralConfig,
        new_price: u64,
        timestamp: u64,
        ctx: &mut TxContext
    ) {
        let old_price = collateral_config.price_feed.price;
        
        collateral_config.price_feed.price = new_price;
        collateral_config.price_feed.timestamp = timestamp;
        
        // Emit price update event
        event::emit(PriceUpdated {
            collateral_type: collateral_config.name,
            old_price,
            new_price,
            timestamp,
        });
    }

    // ======== View Functions ========
    
    /// Get position information
    public fun get_position_info(position: &CollateralPosition): (u64, u64, u64, u64) {
        (
            position.collateral_amount,
            position.alp_minted,
            position.last_update,
            position.accumulated_fee
        )
    }
    
    /// Get protocol statistics
    public fun get_protocol_stats(protocol_state: &ProtocolState): (u64, u64, u64) {
        (
            protocol_state.total_alp_supply,
            protocol_state.total_collateral_value,
            protocol_state.global_collateral_ratio
        )
    }
    
    /// Get collateral configuration
    public fun get_collateral_config(config: &CollateralConfig): (vector<u8>, u64, u64, u64, u64, u64, bool) {
        (
            config.name,
            config.min_ratio,
            config.liquidation_threshold,
            config.debt_ceiling,
            config.current_debt,
            config.price_feed.price,
            config.active
        )
    }
}
