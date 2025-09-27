#[test_only]
module alp::alp_tests {
    use sui::test_scenario::{Self as test, Scenario, next_tx, ctx};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use alp::alp::{Self, ALP, ProtocolState, CollateralPosition, CollateralConfig};

    // Test addresses
    const ADMIN: address = @0xAAAA;
    const USER1: address = @0xBBBB;
    const USER2: address = @0xCCCC;
    const LIQUIDATOR: address = @0xDDDD;

    #[test]
    public fun test_init_protocol() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize the protocol
        next_tx(scenario, ADMIN);
        {
            alp::init_for_testing(ctx(scenario));
        };

        // Check that ProtocolState was created and shared
        next_tx(scenario, ADMIN);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            
            // Check initial state
            let (total_supply, total_collateral, global_ratio) = alp::get_protocol_stats(&protocol_state);
            assert!(total_supply == 0, 0);
            assert!(total_collateral == 0, 1);
            assert!(global_ratio == 0, 2);
            
            test::return_shared(protocol_state);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_create_collateral_config() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize the protocol
        next_tx(scenario, ADMIN);
        {
            alp::init_for_testing(ctx(scenario));
        };

        // Create SUI collateral configuration
        next_tx(scenario, ADMIN);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            
            alp::create_collateral_config(
                &protocol_state,
                b"SUI",
                1_500_000_000, // 150% min ratio
                1_200_000_000, // 120% liquidation threshold
                1000000000000, // 1M ALP debt ceiling
                b"sui_price_feed_id",
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
        };

        // Check collateral config was created
        next_tx(scenario, ADMIN);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            let (name, min_ratio, liq_threshold, debt_ceiling, current_debt, price, active) = 
                alp::get_collateral_config(&collateral_config);
            
            assert!(name == b"SUI", 0);
            assert!(min_ratio == 1_500_000_000, 1);
            assert!(liq_threshold == 1_200_000_000, 2);
            assert!(debt_ceiling == 1000000000000, 3);
            assert!(current_debt == 0, 4);
            assert!(active == true, 5);
            
            test::return_shared(collateral_config);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_create_position_success() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize protocol and collateral config
        setup_protocol_and_collateral(scenario);

        // Update price to $2 per SUI
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            alp::update_price_feed(&mut collateral_config, 2_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // User creates a position
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            // Create 1000 SUI collateral coin (worth $2000)
            let collateral = coin::mint_for_testing<SUI>(1000_000_000_000, ctx(scenario));
            
            // Mint 1000 ALP (requires $1500 collateral at 150% ratio, we have $2000)
            alp::create_position(
                &mut protocol_state,
                &mut collateral_config,
                collateral,
                1000_000_000_000, // 1000 ALP
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
        };

        // Check position was created and ALP minted
        next_tx(scenario, USER1);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            let position = test::take_from_sender<CollateralPosition>(scenario);
            let alp_coin = test::take_from_sender<Coin<ALP>>(scenario);
            
            // Check protocol stats
            let (total_supply, total_collateral, global_ratio) = alp::get_protocol_stats(&protocol_state);
            assert!(total_supply == 1000_000_000_000, 0);
            assert!(total_collateral == 2000_000_000_000, 1); // 1000 SUI * $2
            
            // Check position info
            let (collateral_amount, alp_minted, _, _) = alp::get_position_info(&position);
            assert!(collateral_amount == 1000_000_000_000, 2);
            assert!(alp_minted == 1000_000_000_000, 3);
            
            // Check ALP coin balance
            assert!(coin::value(&alp_coin) == 1000_000_000_000, 4);
            
            test::return_shared(protocol_state);
            test::return_to_sender(scenario, position);
            test::return_to_sender(scenario, alp_coin);
        };

        test::end(scenario_val);
    }

    #[test, expected_failure(abort_code = 1)] // EInsufficientCollateral
    public fun test_create_position_insufficient_collateral() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize protocol and collateral config
        setup_protocol_and_collateral(scenario);

        // Update price to $1 per SUI
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            alp::update_price_feed(&mut collateral_config, 1_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // User tries to create undercollateralized position
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            // Create 1000 SUI collateral coin (worth $1000)
            let collateral = coin::mint_for_testing<SUI>(1000_000_000_000, ctx(scenario));
            
            // Try to mint 1000 ALP (requires $1500 collateral at 150% ratio, we only have $1000)
            alp::create_position(
                &mut protocol_state,
                &mut collateral_config,
                collateral,
                1000_000_000_000, // 1000 ALP
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_add_collateral() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize and create a position
        setup_protocol_and_collateral(scenario);
        create_test_position(scenario, USER1, 1000_000_000_000, 1000_000_000_000);

        // Add more collateral
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            let mut position = test::take_from_sender<CollateralPosition>(scenario);
            
            // Add 500 more SUI
            let additional_collateral = coin::mint_for_testing<SUI>(500_000_000_000, ctx(scenario));
            
            alp::add_collateral(
                &mut protocol_state,
                &mut collateral_config,
                &mut position,
                additional_collateral,
                ctx(scenario)
            );
            
            // Check position was updated
            let (collateral_amount, alp_minted, _, _) = alp::get_position_info(&position);
            assert!(collateral_amount == 1500_000_000_000, 0); // 1000 + 500
            assert!(alp_minted == 1000_000_000_000, 1); // unchanged
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_mint_alp() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize and create a position
        setup_protocol_and_collateral(scenario);
        create_test_position(scenario, USER1, 1000_000_000_000, 500_000_000_000); // Only mint 500 ALP initially

        // Mint additional ALP
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            let mut position = test::take_from_sender<CollateralPosition>(scenario);
            
            // Mint 300 more ALP (total will be 800, still under the 1000 limit given $2000 collateral)
            alp::mint_alp(
                &mut protocol_state,
                &mut collateral_config,
                &mut position,
                300_000_000_000,
                ctx(scenario)
            );
            
            // Check position was updated
            let (collateral_amount, alp_minted, _, _) = alp::get_position_info(&position);
            assert!(collateral_amount == 1000_000_000_000, 0); // unchanged
            assert!(alp_minted == 800_000_000_000, 1); // 500 + 300
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        // Check we received the new ALP tokens
        next_tx(scenario, USER1);
        {
            let alp_coin = test::take_from_sender<Coin<ALP>>(scenario);
            assert!(coin::value(&alp_coin) == 300_000_000_000, 0);
            test::return_to_sender(scenario, alp_coin);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_burn_alp() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize and create a position
        setup_protocol_and_collateral(scenario);
        create_test_position(scenario, USER1, 1000_000_000_000, 1000_000_000_000);

        // Burn some ALP
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            let mut position = test::take_from_sender<CollateralPosition>(scenario);
            let mut alp_coin = test::take_from_sender<Coin<ALP>>(scenario);
            
            // Split off 300 ALP to burn
            let alp_to_burn = coin::split(&mut alp_coin, 300_000_000_000, ctx(scenario));
            
            alp::burn_alp(
                &mut protocol_state,
                &mut collateral_config,
                &mut position,
                alp_to_burn,
                ctx(scenario)
            );
            
            // Check position was updated
            let (collateral_amount, alp_minted, _, _) = alp::get_position_info(&position);
            assert!(collateral_amount == 1000_000_000_000, 0); // unchanged
            assert!(alp_minted == 700_000_000_000, 1); // 1000 - 300
            
            // Check remaining ALP balance
            assert!(coin::value(&alp_coin) == 700_000_000_000, 2);
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
            test::return_to_sender(scenario, alp_coin);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_calculate_health_factor() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Initialize and create a position
        setup_protocol_and_collateral(scenario);
        create_test_position(scenario, USER1, 1000_000_000_000, 1000_000_000_000);

        // Check health factor
        next_tx(scenario, USER1);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            let position = test::take_from_sender<CollateralPosition>(scenario);
            
            // Health factor should be 2.0 (200%) since we have $2000 collateral and $1000 debt
            let health_factor = alp::calculate_health_factor(&position, &collateral_config);
            assert!(health_factor == 2_000_000_000, 0);
            
            // Should not be liquidatable
            let is_liquidatable = alp::is_liquidatable(&position, &collateral_config);
            assert!(!is_liquidatable, 1);
            
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        test::end(scenario_val);
    }

    // Helper function to setup protocol and collateral config
    fun setup_protocol_and_collateral(scenario: &mut Scenario) {
        // Initialize the protocol
        next_tx(scenario, ADMIN);
        {
            alp::init_for_testing(ctx(scenario));
        };

        // Create SUI collateral configuration
        next_tx(scenario, ADMIN);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            
            alp::create_collateral_config(
                &protocol_state,
                b"SUI",
                1_500_000_000, // 150% min ratio
                1_200_000_000, // 120% liquidation threshold
                1000000000000, // 1M ALP debt ceiling
                b"sui_price_feed_id",
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
        };

        // Update price to $2 per SUI
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            alp::update_price_feed(&mut collateral_config, 2_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };
    }

    // Helper function to create a test position
    fun create_test_position(scenario: &mut Scenario, user: address, collateral_amount: u64, alp_amount: u64) {
        next_tx(scenario, user);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            
            let collateral = coin::mint_for_testing<SUI>(collateral_amount, ctx(scenario));
            
            alp::create_position(
                &mut protocol_state,
                &mut collateral_config,
                collateral,
                alp_amount,
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
        };
    }
}
