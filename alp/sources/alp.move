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

    /// Collateral vault for storing deposited tokens
    public struct CollateralVault<phantom T> has key {
        id: UID,
        /// Balance of the collateral tokens
        balance: Balance<T>,
        /// Total amount deposited
        total_deposited: u64,
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
        vault: &mut CollateralVault<T>,
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
        // Use u128 to avoid overflow in intermediate calculation
        let alp_amount_u128 = (alp_amount as u128);
        let min_ratio_u128 = (collateral_config.min_ratio as u128);
        let required_collateral_u128 = (alp_amount_u128 * min_ratio_u128) / 1_000_000_000;
        let required_collateral = (required_collateral_u128 as u64);
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
            // Use u128 to avoid overflow in intermediate calculation
            let total_collateral_u128 = (protocol_state.total_collateral_value as u128);
            let ratio_u128 = (total_collateral_u128 * 1_000_000_000) / (protocol_state.total_alp_supply as u128);
            protocol_state.global_collateral_ratio = (ratio_u128 as u64);
        };
        
        // Store collateral in vault
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut vault.balance, collateral_balance);
        vault.total_deposited = vault.total_deposited + collateral_amount;
        
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
        vault: &mut CollateralVault<T>,
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
            // Use u128 to avoid overflow in intermediate calculation
            let total_collateral_u128 = (protocol_state.total_collateral_value as u128);
            let ratio_u128 = (total_collateral_u128 * 1_000_000_000) / (protocol_state.total_alp_supply as u128);
            protocol_state.global_collateral_ratio = (ratio_u128 as u64);
        };
        
        // Store additional collateral in vault
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut vault.balance, collateral_balance);
        vault.total_deposited = vault.total_deposited + collateral_amount;
        
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
        let new_alp_total_128 = (new_alp_total as u128);
        let min_ratio_128 = (collateral_config.min_ratio as u128);
        let required_collateral = ((new_alp_total_128 * min_ratio_128) / 1_000_000_000u128) as u64;
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
            (((protocol_state.total_collateral_value as u128) * 1_000_000_000) / (protocol_state.total_alp_supply as u128) as u64);
        
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
                (((protocol_state.total_collateral_value as u128) * 1_000_000_000) / (protocol_state.total_alp_supply as u128) as u64);
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

    /// Burn ALP tokens during liquidation (bypasses owner check)
    public fun burn_alp_liquidation(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        position: &mut CollateralPosition,
        alp_coins: Coin<ALP>,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        
        let burn_amount = coin::value(&alp_coins);
        assert!(burn_amount > 0, EInvalidAmount);
        assert!(burn_amount <= position.alp_minted, EInsufficientALP);
        
        // Burn the ALP tokens
        coin::burn(&mut protocol_state.treasury_cap, alp_coins);
        
        // Update position
        position.alp_minted = position.alp_minted - burn_amount;
        
        // Update protocol state
        protocol_state.total_alp_supply = protocol_state.total_alp_supply - burn_amount;
        
        // Calculate and update collateral value
        let collateral_value = calculate_collateral_value(position.collateral_amount, &collateral_config.price_feed);
        protocol_state.total_collateral_value = protocol_state.total_collateral_value - collateral_value + collateral_value; // Recalculate
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (((protocol_state.total_collateral_value as u128) * 1_000_000_000) / (protocol_state.total_alp_supply as u128) as u64);
        };
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: position.collateral_amount,
            alp_minted: position.alp_minted,
            action: b"liquidation_burn",
        });
    }

    public entry fun withdraw_collateral<T>(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        vault: &mut CollateralVault<T>,
        position: &mut CollateralPosition,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(position.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(position.alp_minted == 0, EInsufficientCollateral); // No debt remaining
        
        // Return all collateral to user
        let collateral_amount = position.collateral_amount;
        assert!(collateral_amount > 0, EInvalidAmount);
        
        // Calculate collateral value for protocol state update
        let collateral_value = calculate_collateral_value(collateral_amount, &collateral_config.price_feed);
        
        // Withdraw collateral from vault and return to user
        let withdrawn_balance = balance::split(&mut vault.balance, collateral_amount);
        let withdrawn_coin = coin::from_balance(withdrawn_balance, ctx);
        vault.total_deposited = vault.total_deposited - collateral_amount;
        
        // Update position
        position.collateral_amount = 0;
        position.last_update = tx_context::epoch_timestamp_ms(ctx);
        
        // Update protocol state
        protocol_state.total_collateral_value = protocol_state.total_collateral_value - collateral_value;
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (protocol_state.total_collateral_value * 1_000_000_000) / protocol_state.total_alp_supply;
        } else {
            protocol_state.global_collateral_ratio = 0;
        };
        
        // Transfer collateral back to user
        transfer::public_transfer(withdrawn_coin, tx_context::sender(ctx));
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: 0,
            alp_minted: 0,
            action: b"withdraw",
        });
    }

    /// Partially withdraw collateral from a position (maintaining safe collateral ratio)
    public entry fun withdraw_partial_collateral<T>(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        vault: &mut CollateralVault<T>,
        position: &mut CollateralPosition,
        withdraw_amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(!protocol_state.paused, EUnauthorized);
        assert!(position.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(withdraw_amount > 0, EInvalidAmount);
        assert!(withdraw_amount <= position.collateral_amount, EInvalidAmount);
        
        // Calculate remaining collateral after withdrawal
        let remaining_collateral = position.collateral_amount - withdraw_amount;
        
        // If there's debt, ensure remaining collateral maintains safe ratio
        if (position.alp_minted > 0) {
            let remaining_value = calculate_collateral_value(remaining_collateral, &collateral_config.price_feed);
            // Use u128 to avoid overflow in intermediate calculation
            let alp_minted_u128 = (position.alp_minted as u128);
            let min_ratio_u128 = (collateral_config.min_ratio as u128);
            let required_collateral_u128 = (alp_minted_u128 * min_ratio_u128) / 1_000_000_000;
            let required_collateral = (required_collateral_u128 as u64);
            assert!(remaining_value >= required_collateral, EInsufficientCollateral);
        };
        
        // Calculate collateral value for protocol state update
        let withdrawn_value = calculate_collateral_value(withdraw_amount, &collateral_config.price_feed);
        
        // Withdraw collateral from vault and return to user
        let withdrawn_balance = balance::split(&mut vault.balance, withdraw_amount);
        let withdrawn_coin = coin::from_balance(withdrawn_balance, ctx);
        vault.total_deposited = vault.total_deposited - withdraw_amount;
        
        // Update position
        position.collateral_amount = remaining_collateral;
        position.last_update = tx_context::epoch_timestamp_ms(ctx);
        
        // Update protocol state
        protocol_state.total_collateral_value = protocol_state.total_collateral_value - withdrawn_value;
        
        // Update global collateral ratio
        if (protocol_state.total_alp_supply > 0) {
            protocol_state.global_collateral_ratio = 
                (((protocol_state.total_collateral_value as u128) * 1_000_000_000) / (protocol_state.total_alp_supply as u128)) as u64;
        };
        
        // Transfer collateral back to user
        transfer::public_transfer(withdrawn_coin, tx_context::sender(ctx));
        
        // Emit event
        event::emit(PositionUpdated {
            position_id: object::uid_to_address(&position.id),
            owner: position.owner,
            collateral_amount: position.collateral_amount,
            alp_minted: position.alp_minted,
            action: b"partial_withdraw",
        });
    }

    // ======== Helper Functions ========
    
    /// Calculate collateral value in USD terms
    fun calculate_collateral_value(amount: u64, price_feed: &PriceFeed): u64 {
        // Convert collateral amount to USD value using price feed
        // This assumes the price feed gives price in USD with 9 decimal places
        // Use u128 to avoid overflow in intermediate calculation
        let amount_u128 = (amount as u128);
        let price_u128 = (price_feed.price as u128);
        let result_u128 = (amount_u128 * price_u128) / 1_000_000_000;
        (result_u128 as u64)
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
        // Use u128 to avoid overflow in intermediate calculation
        let collateral_value_u128 = (collateral_value as u128);
        let health_factor_u128 = (collateral_value_u128 * 1_000_000_000) / (position.alp_minted as u128);
        (health_factor_u128 as u64)
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

    /// Create a new collateral vault for a specific token type
    public entry fun create_collateral_vault<T>(
        protocol_state: &ProtocolState,
        ctx: &mut TxContext
    ) {
        assert!(protocol_state.admin == tx_context::sender(ctx), EUnauthorized);
        
        let vault = CollateralVault<T> {
            id: object::new(ctx),
            balance: balance::zero<T>(),
            total_deposited: 0,
        };
        
        transfer::share_object(vault);
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

    /// Get vault information
    public fun get_vault_info<T>(vault: &CollateralVault<T>): (u64, u64) {
        (
            balance::value(&vault.balance),
            vault.total_deposited
        )
    }

    // ======== Test-only Functions ========
    
    #[test_only]
    /// Initialize for testing
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ALP {}, ctx);
    }
}