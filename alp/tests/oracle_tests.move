#[test_only]
module alp::oracle_tests {
    use sui::test_scenario::{Self as test, Scenario, next_tx, ctx};
    use alp::oracle::{Self, OracleState, OracleManagerCap, PythPriceInfoObject};
    use alp::alp::{Self, CollateralConfig, ProtocolState};

    // Test addresses
    const ADMIN: address = @0xAAAA;
    const ORACLE_UPDATER: address = @0xEEEE;
    const UNAUTHORIZED: address = @0xFFFF;

    #[test]
    public fun test_oracle_init() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize oracle
        next_tx(scenario, ADMIN);
        {
            oracle::init_for_testing(ctx(scenario));
        };

        // Check oracle state was created
        next_tx(scenario, ADMIN);
        {
            let oracle_state = test::take_shared<OracleState>(scenario);
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            
            let (pyth_state_id, wormhole_state_id, paused) = oracle::get_oracle_state(&oracle_state);
            assert!(pyth_state_id == @0x0, 0);
            assert!(wormhole_state_id == @0x0, 1);
            assert!(!paused, 2);
            
            // Admin should be authorized by default
            assert!(oracle::is_authorized_updater(&oracle_state, ADMIN), 3);
            
            test::return_shared(oracle_state);
            test::return_to_sender(scenario, oracle_cap);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_set_oracle_addresses() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize oracle
        setup_oracle(scenario);

        // Set oracle addresses
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::set_oracle_addresses(
                &oracle_cap,
                &mut oracle_state,
                @0x1234, // pyth_state_id
                @0x5678, // wormhole_state_id
                ctx(scenario)
            );
            
            let (pyth_state_id, wormhole_state_id, _) = oracle::get_oracle_state(&oracle_state);
            assert!(pyth_state_id == @0x1234, 0);
            assert!(wormhole_state_id == @0x5678, 1);
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_add_remove_authorized_updater() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize oracle
        setup_oracle(scenario);

        // Add authorized updater
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::add_authorized_updater(&oracle_cap, &mut oracle_state, ORACLE_UPDATER, ctx(scenario));
            
            assert!(oracle::is_authorized_updater(&oracle_state, ORACLE_UPDATER), 0);
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        // Remove authorized updater
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::remove_authorized_updater(&oracle_cap, &mut oracle_state, ORACLE_UPDATER, ctx(scenario));
            
            assert!(!oracle::is_authorized_updater(&oracle_state, ORACLE_UPDATER), 0);
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_pause_resume_oracle() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize oracle
        setup_oracle(scenario);

        // Pause oracle
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::pause_oracle(&oracle_cap, &mut oracle_state, ctx(scenario));
            
            let (_, _, paused) = oracle::get_oracle_state(&oracle_state);
            assert!(paused, 0);
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        // Resume oracle
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::resume_oracle(&oracle_cap, &mut oracle_state, ctx(scenario));
            
            let (_, _, paused) = oracle::get_oracle_state(&oracle_state);
            assert!(!paused, 0);
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_update_collateral_price() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup oracle and protocol
        setup_oracle_and_protocol(scenario);

        // Update collateral price
        next_tx(scenario, ADMIN);
        {
            let oracle_state = test::take_shared<OracleState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            // Create mock Pyth price info
            let current_time = test::ctx(scenario).epoch_timestamp_ms();
            let price_info = create_mock_price_info(
                2_500_000_000, // $2.5 per SUI
                1000000,       // confidence
                9,             // expo (9 decimals)
                current_time,  // publish_time
                ctx(scenario)
            );
            
            oracle::update_collateral_price(
                &oracle_state,
                &mut collateral_config,
                &price_info,
                ctx(scenario)
            );
            
            // Check that price was updated
            let (_, _, _, _, _, price, _) = alp::get_collateral_config(&collateral_config);
            assert!(price == 2_500_000_000, 0);
            
            test::return_shared(oracle_state);
            test::return_shared(collateral_config);
            sui::test_utils::destroy(price_info);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_update_chf_price() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup oracle
        setup_oracle(scenario);

        // Update CHF price
        next_tx(scenario, ADMIN);
        {
            let oracle_state = test::take_shared<OracleState>(scenario);
            
            // Create mock Pyth price info for CHF/USD
            let current_time = test::ctx(scenario).epoch_timestamp_ms();
            let price_info = create_mock_price_info(
                1_100_000_000, // 1.1 USD per CHF
                500000,        // confidence
                9,             // expo
                current_time,  // publish_time
                ctx(scenario)
            );
            
            oracle::update_chf_price(&oracle_state, &price_info, ctx(scenario));
            
            test::return_shared(oracle_state);
            sui::test_utils::destroy(price_info);
        };

        test::end(scenario_val);
    }

    #[test, expected_failure(abort_code = 3)] // EUnauthorized
    public fun test_unauthorized_price_update() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup oracle and protocol
        setup_oracle_and_protocol(scenario);

        // Try to update price with unauthorized account
        next_tx(scenario, UNAUTHORIZED);
        {
            let oracle_state = test::take_shared<OracleState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            let current_time = test::ctx(scenario).epoch_timestamp_ms();
            let price_info = create_mock_price_info(
                2_000_000_000,
                1000000,
                9,
                current_time,
                ctx(scenario)
            );
            
            oracle::update_collateral_price(
                &oracle_state,
                &mut collateral_config,
                &price_info,
                ctx(scenario)
            );
            
            test::return_shared(oracle_state);
            test::return_shared(collateral_config);
            sui::test_utils::destroy(price_info);
        };

        test::end(scenario_val);
    }

    #[test, expected_failure(abort_code = 3)] // EUnauthorized (paused)
    public fun test_paused_price_update() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup oracle and protocol
        setup_oracle_and_protocol(scenario);

        // Pause oracle first
        next_tx(scenario, ADMIN);
        {
            let oracle_cap = test::take_from_sender<OracleManagerCap>(scenario);
            let mut oracle_state = test::take_shared<OracleState>(scenario);
            
            oracle::pause_oracle(&oracle_cap, &mut oracle_state, ctx(scenario));
            
            test::return_to_sender(scenario, oracle_cap);
            test::return_shared(oracle_state);
        };

        // Try to update price while paused
        next_tx(scenario, ADMIN);
        {
            let oracle_state = test::take_shared<OracleState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            let current_time = test::ctx(scenario).epoch_timestamp_ms();
            let price_info = create_mock_price_info(
                2_000_000_000,
                1000000,
                9,
                current_time,
                ctx(scenario)
            );
            
            oracle::update_collateral_price(
                &oracle_state,
                &mut collateral_config,
                &price_info,
                ctx(scenario)
            );
            
            test::return_shared(oracle_state);
            test::return_shared(collateral_config);
            sui::test_utils::destroy(price_info);
        };

        test::end(scenario_val);
    }

    // Helper functions
    fun setup_oracle(scenario: &mut Scenario) {
        next_tx(scenario, ADMIN);
        {
            oracle::init_for_testing(ctx(scenario));
        };
    }

    fun setup_oracle_and_protocol(scenario: &mut Scenario) {
        // Initialize oracle
        setup_oracle(scenario);

        // Initialize protocol
        next_tx(scenario, ADMIN);
        {
            alp::init_for_testing(ctx(scenario));
        };

        // Create collateral config
        next_tx(scenario, ADMIN);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            
            alp::create_collateral_config(
                &protocol_state,
                b"SUI",
                1_500_000_000,
                1_200_000_000,
                1000000000000,
                b"sui_price_feed_id",
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
        };
    }

    fun create_mock_price_info(
        price: u64,
        conf: u64,
        expo: u8,
        publish_time: u64,
        ctx: &mut sui::tx_context::TxContext
    ): PythPriceInfoObject {
        oracle::create_mock_price_info_for_testing(price, conf, expo, publish_time, ctx)
    }
}
