#[test_only]
module alp::liquidation_tests {
    use sui::test_scenario::{Self as test, Scenario, next_tx, ctx};
    use sui::coin;
    use sui::sui::SUI;
    use sui::transfer;
    use alp::alp::{Self, ALP, ProtocolState, CollateralPosition, CollateralConfig, CollateralVault};
    use alp::liquidation;

    // Test addresses
    const ADMIN: address = @0xAAAA;
    const USER1: address = @0xBBBB;
    const LIQUIDATOR: address = @0xDDDD;

    #[test]
    public fun test_liquidation_info_healthy_position() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup protocol and create a healthy position
        setup_protocol_and_position(scenario);

        // Check liquidation info for healthy position
        next_tx(scenario, USER1);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            let position = test::take_from_sender<CollateralPosition>(scenario);
            
            let (is_liquidatable, max_debt, collateral_to_seize, health_factor) = 
                liquidation::get_liquidation_info(&position, &collateral_config);
            
            // Position should not be liquidatable (health factor = 200%)
            assert!(!is_liquidatable, 0);
            assert!(max_debt == 0, 1);
            assert!(collateral_to_seize == 0, 2);
            assert!(health_factor == 2_000_000_000, 3); // 200%
            
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_liquidation_info_liquidatable_position() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup protocol and create a position
        setup_protocol_and_position(scenario);

        // Drop SUI price to make position liquidatable
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            // Drop price to $1 per SUI (position becomes 100% collateralized, below 120% threshold)
            alp::update_price_feed(&mut collateral_config, 1_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // Check liquidation info for liquidatable position
        next_tx(scenario, USER1);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            let position = test::take_from_sender<CollateralPosition>(scenario);
            
            let (is_liquidatable, max_debt, collateral_to_seize, health_factor) = 
                liquidation::get_liquidation_info(&position, &collateral_config);
            
            // Position should be liquidatable (health factor = 100%, below 120% threshold)
            assert!(is_liquidatable, 0);
            assert!(max_debt > 0, 1); // Should be able to liquidate some debt
            assert!(collateral_to_seize > 0, 2); // Should seize some collateral
            assert!(health_factor == 1_000_000_000, 3); // 100%
            
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_calculate_liquidation_penalty() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup protocol and create a position
        setup_protocol_and_position(scenario);

        // Make position slightly liquidatable
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            // Price at $1.1 per SUI (110% collateralized, below 120% threshold)
            alp::update_price_feed(&mut collateral_config, 1_100_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // Check liquidation penalty
        next_tx(scenario, USER1);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            let position = test::take_from_sender<CollateralPosition>(scenario);
            
            let penalty = liquidation::calculate_liquidation_penalty(&position, &collateral_config);
            
            // Should have base penalty plus additional penalty for being below threshold
            assert!(penalty >= 130_000_000, 0); // At least 13% base penalty
            
            test::return_shared(collateral_config);
            test::return_to_sender(scenario, position);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_calculate_optimal_liquidation() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup protocol and create a liquidatable position
        setup_protocol_and_position(scenario);

        // Make position liquidatable
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            alp::update_price_feed(&mut collateral_config, 1_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // Test optimal liquidation calculation
        next_tx(scenario, LIQUIDATOR);
        {
            let collateral_config = test::take_shared<CollateralConfig>(scenario);
            let position = test::take_from_address<CollateralPosition>(scenario, USER1);
            
            // Test with different available ALP amounts
            let optimal_100 = liquidation::calculate_optimal_liquidation(&position, &collateral_config, 100_000_000_000);
            let optimal_1000 = liquidation::calculate_optimal_liquidation(&position, &collateral_config, 1000_000_000_000);
            
            assert!(optimal_100 > 0, 0);
            assert!(optimal_1000 > 0, 1);
            assert!(optimal_100 <= 100_000_000_000, 2);
            assert!(optimal_1000 <= 1000_000_000_000, 3);
            
            test::return_shared(collateral_config);
            transfer::public_transfer(position, USER1);
        };

        test::end(scenario_val);
    }

    #[test]
    public fun test_batch_liquidate_simple() {
        let mut scenario_val = test::begin(ADMIN);
        let scenario = &mut scenario_val;

        // Setup protocol and create a liquidatable position
        setup_protocol_and_position(scenario);

        // Make position liquidatable by dropping price
        next_tx(scenario, ADMIN);
        {
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            alp::update_price_feed(&mut collateral_config, 1_000_000_000, 1000, ctx(scenario));
            test::return_shared(collateral_config);
        };

        // Liquidator performs batch liquidation
        next_tx(scenario, LIQUIDATOR);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            let mut position = test::take_from_address<CollateralPosition>(scenario, USER1);
            
            // Create ALP payment for liquidation
            let alp_payment = coin::mint_for_testing<ALP>(200_000_000_000, ctx(scenario)); // 200 ALP
            
            let (_, original_debt, _, _) = alp::get_position_info(&position);
            
            liquidation::batch_liquidate_simple(
                &mut protocol_state,
                &mut collateral_config,
                &mut position,
                alp_payment,
                ctx(scenario)
            );
            
            // Check that debt was reduced
            let (_, new_debt, _, _) = alp::get_position_info(&position);
            assert!(new_debt < original_debt, 0);
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
            
            // Need to return position to original owner
            transfer::public_transfer(position, USER1);
        };

        test::end(scenario_val);
    }

    // Helper function to setup protocol and create a position
    fun setup_protocol_and_position(scenario: &mut Scenario) {
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

        // Create collateral vault
        next_tx(scenario, ADMIN);
        {
            let protocol_state = test::take_shared<ProtocolState>(scenario);
            
            alp::create_collateral_vault<SUI>(
                &protocol_state,
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

        // User creates a position
        next_tx(scenario, USER1);
        {
            let mut protocol_state = test::take_shared<ProtocolState>(scenario);
            let mut collateral_config = test::take_shared<CollateralConfig>(scenario);
            let mut vault = test::take_shared<CollateralVault<SUI>>(scenario);
            
            let collateral = coin::mint_for_testing<SUI>(1000_000_000_000, ctx(scenario)); // 1000 SUI
            
            alp::create_position(
                &mut protocol_state,
                &mut collateral_config,
                &mut vault,
                collateral,
                1000_000_000_000, // 1000 ALP
                ctx(scenario)
            );
            
            test::return_shared(protocol_state);
            test::return_shared(collateral_config);
            test::return_shared(vault);
        };
    }
}
