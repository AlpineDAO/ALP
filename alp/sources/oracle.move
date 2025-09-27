/// Oracle integration module for ALP stablecoin
/// Integrates with Pyth Network for real-time price feeds
module alp::oracle {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::vector;
    use alp::alp::{Self, CollateralConfig};

    // ======== Constants ========
    
    /// Maximum allowed price age in milliseconds (5 minutes)
    const MAX_PRICE_AGE: u64 = 300_000;
    
    /// CHF/USD price feed ID from Pyth Network
    const CHF_USD_PRICE_FEED_ID: vector<u8> = x"796d24444ff50728b58e94b1f53dc3a406b2f1ba9d0d0b91d4406c37491a6feb"; // Example ID
    
    /// SUI/USD price feed ID from Pyth Network  
    const SUI_USD_PRICE_FEED_ID: vector<u8> = x"50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266";
    
    /// BTC/USD price feed ID from Pyth Network
    const BTC_USD_PRICE_FEED_ID: vector<u8> = x"f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b";

    // ======== Error codes ========
    
    const EPriceStale: u64 = 1;
    const EInvalidPriceFeed: u64 = 2;
    const EUnauthorized: u64 = 3;
    const EPriceNegative: u64 = 4;

    // ======== Structs ========
    
    /// Oracle manager capability
    public struct OracleManagerCap has key, store {
        id: UID,
    }
    
    /// Price update request
    public struct PriceUpdateRequest has copy, drop {
        feed_id: vector<u8>,
        price: u64,
        conf: u64,
        expo: u8, // Changed from i8 to u8
        publish_time: u64,
    }
    
    /// Oracle state for managing price feeds
    public struct OracleState has key {
        id: UID,
        /// Pyth state object ID
        pyth_state_id: address,
        /// Wormhole state object ID  
        wormhole_state_id: address,
        /// Authorized oracle updaters
        authorized_updaters: vector<address>,
        /// Emergency pause flag
        paused: bool,
    }

    // ======== Events ========
    
    public struct PriceFeedUpdated has copy, drop {
        feed_id: vector<u8>,
        price: u64,
        confidence: u64,
        publish_time: u64,
        expo: u8, // Changed from i8 to u8
    }
    
    public struct OracleStateUpdated has copy, drop {
        pyth_state_id: address,
        wormhole_state_id: address,
    }

    // ======== Init Function ========
    
    /// Initialize the oracle module
    fun init(ctx: &mut TxContext) {
        let oracle_manager_cap = OracleManagerCap {
            id: object::new(ctx),
        };
        
        let mut oracle_state = OracleState {
            id: object::new(ctx),
            pyth_state_id: @0x0, // To be set by admin
            wormhole_state_id: @0x0, // To be set by admin
            authorized_updaters: vector::empty(),
            paused: false,
        };

        // Add the deployer as an authorized updater
        vector::push_back(&mut oracle_state.authorized_updaters, tx_context::sender(ctx));
        
        transfer::transfer(oracle_manager_cap, tx_context::sender(ctx));
        transfer::share_object(oracle_state);
    }

    // ======== Public Functions ========
    
    /// Update collateral price using Pyth price feed
    public entry fun update_collateral_price(
        oracle_state: &OracleState,
        collateral_config: &mut CollateralConfig,
        pyth_price_info: &PythPriceInfoObject,
        ctx: &mut TxContext
    ) {
        assert!(!oracle_state.paused, EUnauthorized);
        
        // Verify caller is authorized (in production, this would be called by Pyth price service)
        let sender = tx_context::sender(ctx);
        assert!(vector::contains(&oracle_state.authorized_updaters, &sender), EUnauthorized);
        
        // Extract price data from Pyth price info object
        let (price, conf, expo, publish_time) = extract_pyth_price_data(pyth_price_info);
        
        // Validate price data
        assert!(price > 0, EPriceNegative);
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(current_time >= publish_time && current_time - publish_time <= MAX_PRICE_AGE, EPriceStale);
        
        // Convert price to our format (9 decimal places)
        let normalized_price = normalize_price(price, expo);
        
        // Update the collateral configuration
        alp::update_price_feed(collateral_config, normalized_price, publish_time, ctx);
        
        // Emit event
        event::emit(PriceFeedUpdated {
            feed_id: get_price_feed_id(collateral_config),
            price: normalized_price,
            confidence: conf,
            publish_time,
            expo,
        });
    }
    
    /// Update CHF/USD price (for peg calculations)
    public entry fun update_chf_price(
        oracle_state: &OracleState,
        pyth_price_info: &PythPriceInfoObject,
        ctx: &mut TxContext
    ) {
        assert!(!oracle_state.paused, EUnauthorized);
        
        let sender = tx_context::sender(ctx);
        assert!(vector::contains(&oracle_state.authorized_updaters, &sender), EUnauthorized);
        
        let (price, conf, expo, publish_time) = extract_pyth_price_data(pyth_price_info);
        
        assert!(price > 0, EPriceNegative);
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(current_time >= publish_time && current_time - publish_time <= MAX_PRICE_AGE, EPriceStale);
        
        let normalized_price = normalize_price(price, expo);
        
        // Store CHF price for peg calculations (implementation would store this in global state)
        // For now, just emit the event
        event::emit(PriceFeedUpdated {
            feed_id: CHF_USD_PRICE_FEED_ID,
            price: normalized_price,
            confidence: conf,
            publish_time,
            expo,
        });
    }
    
    /// Batch update multiple price feeds
    public fun batch_update_prices(
        oracle_state: &OracleState,
        collateral_configs: &mut vector<CollateralConfig>,
        pyth_price_infos: &vector<PythPriceInfoObject>,
        ctx: &mut TxContext
    ) {
        assert!(!oracle_state.paused, EUnauthorized);

        let sender = tx_context::sender(ctx);
        assert!(vector::contains(&oracle_state.authorized_updaters, &sender), EUnauthorized);

        let configs_len = vector::length(collateral_configs);
        let prices_len = vector::length(pyth_price_infos);
        assert!(configs_len == prices_len, EInvalidPriceFeed);

        let mut i = 0;
        while (i < configs_len) {
            let config = vector::borrow_mut(collateral_configs, i);
            let price_info = vector::borrow(pyth_price_infos, i);

            let (price, _conf, expo, publish_time) = extract_pyth_price_data(price_info);

            if (price > 0) {
                let current_time = tx_context::epoch_timestamp_ms(ctx);
                if (current_time - publish_time <= MAX_PRICE_AGE) {
                    let normalized_price = normalize_price(price, expo);
                    alp::update_price_feed(config, normalized_price, publish_time, ctx);
                };
            };

            i = i + 1;
        };
    }

    // ======== Admin Functions ========
    
    /// Set Pyth and Wormhole state IDs
    public entry fun set_oracle_addresses(
        _: &OracleManagerCap,
        oracle_state: &mut OracleState,
        pyth_state_id: address,
        wormhole_state_id: address,
        ctx: &mut TxContext
    ) {
        oracle_state.pyth_state_id = pyth_state_id;
        oracle_state.wormhole_state_id = wormhole_state_id;
        
        event::emit(OracleStateUpdated {
            pyth_state_id,
            wormhole_state_id,
        });
    }
    
    /// Add authorized updater
    public entry fun add_authorized_updater(
        _: &OracleManagerCap,
        oracle_state: &mut OracleState,
        updater: address,
        ctx: &mut TxContext
    ) {
        if (!vector::contains(&oracle_state.authorized_updaters, &updater)) {
            vector::push_back(&mut oracle_state.authorized_updaters, updater);
        };
    }
    
    /// Remove authorized updater
    public entry fun remove_authorized_updater(
        _: &OracleManagerCap,
        oracle_state: &mut OracleState,
        updater: address,
        ctx: &mut TxContext
    ) {
        let (found, index) = vector::index_of(&oracle_state.authorized_updaters, &updater);
        if (found) {
            vector::remove(&mut oracle_state.authorized_updaters, index);
        };
    }
    
    /// Emergency pause oracle updates
    public entry fun pause_oracle(
        _: &OracleManagerCap,
        oracle_state: &mut OracleState,
        ctx: &mut TxContext
    ) {
        oracle_state.paused = true;
    }
    
    /// Resume oracle updates
    public entry fun resume_oracle(
        _: &OracleManagerCap,
        oracle_state: &mut OracleState,
        ctx: &mut TxContext
    ) {
        oracle_state.paused = false;
    }

    // ======== Helper Functions ========
    
    /// Placeholder for Pyth price info object (would be imported from Pyth SDK)
    public struct PythPriceInfoObject has key {
        id: UID,
        price: u64,
        conf: u64,
        expo: u8, // Changed from i8 to u8
        publish_time: u64,
    }
    
    /// Extract price data from Pyth price info object
    fun extract_pyth_price_data(price_info: &PythPriceInfoObject): (u64, u64, u8, u64) {
        (
            price_info.price,
            price_info.conf,
            price_info.expo,
            price_info.publish_time
        )
    }
    
    /// Normalize price to 9 decimal places
    fun normalize_price(price: u64, expo: u8): u64 {
        // Convert price based on exponent to our standard 9 decimal places
        // For simplicity, assume expo is small and handle basic cases
        if (expo == 0) {
            price
        } else if (expo <= 9) {
            // Multiply to reach our target precision
            let multiplier = pow_10(9 - expo);
            price * multiplier
        } else {
            // Divide to reach our target precision
            let divisor = pow_10(expo - 9);
            price / divisor
        }
    }
    
    /// Calculate power of 10
    fun pow_10(exp: u8): u64 {
        let mut result = 1u64;
        let mut i = 0u8;
        while (i < exp) {
            result = result * 10;
            i = i + 1;
        };
        result
    }
    
    /// Get price feed ID for a collateral type
    fun get_price_feed_id(config: &CollateralConfig): vector<u8> {
        let (name, _, _, _, _, _, _) = alp::get_collateral_config(config);

        if (name == b"SUI") {
            SUI_USD_PRICE_FEED_ID
        } else if (name == b"BTC") {
            BTC_USD_PRICE_FEED_ID
        } else {
            vector::empty() // Unknown collateral type
        }
    }

    // ======== View Functions ========
    
    /// Get oracle state information
    public fun get_oracle_state(oracle_state: &OracleState): (address, address, bool) {
        (
            oracle_state.pyth_state_id,
            oracle_state.wormhole_state_id,
            oracle_state.paused
        )
    }
    
    /// Check if an address is authorized to update prices
    public fun is_authorized_updater(oracle_state: &OracleState, updater: address): bool {
        vector::contains(&oracle_state.authorized_updaters, &updater)
    }
    
    /// Get the list of authorized updaters
    public fun get_authorized_updaters(oracle_state: &OracleState): &vector<address> {
        &oracle_state.authorized_updaters
    }

    // ======== Test-only Functions ========
    
    #[test_only]
    /// Initialize for testing
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
    
    #[test_only]
    /// Create mock price info for testing
    public fun create_mock_price_info_for_testing(
        price: u64,
        conf: u64,
        expo: u8,
        publish_time: u64,
        ctx: &mut TxContext
    ): PythPriceInfoObject {
        PythPriceInfoObject {
            id: object::new(ctx),
            price,
            conf,
            expo,
            publish_time,
        }
    }
}
