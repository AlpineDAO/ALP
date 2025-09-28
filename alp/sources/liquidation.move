/// Liquidation module for ALP stablecoin
/// Handles liquidation of undercollateralized positions
module alp::liquidation {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance;
    use std::vector;
    use alp::alp::{Self, ALP, CollateralPosition, CollateralConfig, ProtocolState, CollateralVault};

    // ======== Constants ========
    
    /// Maximum liquidation percentage (50% of debt)
    const MAX_LIQUIDATION_PERCENTAGE: u64 = 500_000_000; // 50% in 9 decimal precision
    
    /// Liquidator reward percentage (5% of liquidated collateral)
    const LIQUIDATOR_REWARD: u64 = 50_000_000; // 5% in 9 decimal precision
    
    /// Protocol fee on liquidations (3% of liquidated collateral)
    const PROTOCOL_LIQUIDATION_FEE: u64 = 30_000_000; // 3% in 9 decimal precision

    // ======== Error codes ========
    
    const EPositionNotLiquidatable: u64 = 1;
    const EInsufficientALP: u64 = 2;
    const EInvalidAmount: u64 = 3;
    const EUnauthorized: u64 = 4;
    const ELiquidationAmountTooHigh: u64 = 5;

    // ======== Structs ========
    
    /// Liquidation manager capability
    public struct LiquidationManagerCap has key, store {
        id: UID,
    }
    
    /// Liquidation event details
    public struct LiquidationExecuted has copy, drop {
        position_id: address,
        liquidator: address,
        position_owner: address,
        alp_burned: u64,
        collateral_liquidated: u64,
        liquidator_reward: u64,
        protocol_fee: u64,
        remaining_collateral: u64,
        remaining_debt: u64,
    }
    
    /// Liquidation auction (for future implementation)
    public struct LiquidationAuction has key, store {
        id: UID,
        position_id: address,
        start_time: u64,
        duration: u64,
        starting_price: u64,
        current_highest_bid: u64,
        highest_bidder: address,
        collateral_amount: u64,
        debt_amount: u64,
        active: bool,
    }

    // ======== Init Function ========
    
    fun init(ctx: &mut TxContext) {
        let liquidation_manager_cap = LiquidationManagerCap {
            id: object::new(ctx),
        };
        
        transfer::transfer(liquidation_manager_cap, tx_context::sender(ctx));
    }

    // ======== Public Entry Functions ========
    
    /// Liquidate an undercollateralized position
    public entry fun liquidate_position<T>(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        vault: &mut CollateralVault<T>,
        position: &mut CollateralPosition,
        mut alp_payment: Coin<ALP>,
        max_liquidation_amount: u64,
        ctx: &mut TxContext
    ) {
        // Check if position is liquidatable
        assert!(alp::is_liquidatable(position, collateral_config), EPositionNotLiquidatable);

        let alp_payment_amount = coin::value(&alp_payment);
        assert!(alp_payment_amount > 0, EInvalidAmount);

        let (collateral_amount, alp_minted, _, _) = alp::get_position_info(position);
        
        // Calculate maximum liquidatable amount (50% of debt or remaining debt, whichever is smaller)
        let max_liquidatable = if (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) < (alp_minted as u128)) {
            (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) as u64)
        } else {
            alp_minted
        };
        
        // Determine actual liquidation amount
        let liquidation_amount = if (max_liquidation_amount > 0 && max_liquidation_amount < max_liquidatable) {
            max_liquidation_amount
        } else {
            max_liquidatable
        };
        
        // Ensure liquidator has enough ALP
        assert!(alp_payment_amount >= liquidation_amount, EInsufficientALP);
        
        // Calculate collateral to be liquidated (with penalty)
        let (_, _, _, _, _, collateral_price, _) = alp::get_collateral_config(collateral_config);
        let collateral_value_needed = liquidation_amount; // 1:1 for simplicity
        let liquidation_penalty = 130_000_000; // 13% penalty from protocol constants
        let penalty_multiplier = 1_000_000_000 + liquidation_penalty; // 100% + penalty
        let collateral_to_liquidate = (((collateral_value_needed as u128) * (penalty_multiplier as u128)) / (collateral_price as u128) as u64);
        
        // Ensure we don't liquidate more collateral than available
        let collateral_to_liquidate = if (collateral_to_liquidate > collateral_amount) {
            collateral_amount
        } else {
            collateral_to_liquidate
        };
        
        // Calculate rewards and fees
        let liquidator_reward = (((collateral_to_liquidate as u128) * (LIQUIDATOR_REWARD as u128)) / 1_000_000_000u128 as u64);
        let protocol_fee = (((collateral_to_liquidate as u128) * (PROTOCOL_LIQUIDATION_FEE as u128)) / 1_000_000_000u128 as u64);
        let _net_collateral_liquidated = collateral_to_liquidate - liquidator_reward - protocol_fee;
        
        // 1. Burn the ALP tokens used for liquidation
        let alp_to_burn = coin::split(&mut alp_payment, liquidation_amount, ctx);
        alp::burn_alp_liquidation(protocol_state, collateral_config, position, alp_to_burn, ctx);
        
        // 2. Withdraw collateral from vault for liquidation
        let mut total_collateral_withdrawn = balance::split(alp::get_vault_balance_mut(vault), collateral_to_liquidate);
        
        // 3. Split collateral into liquidator reward, protocol fee, and net liquidated amount
        let liquidator_reward_balance = balance::split(&mut total_collateral_withdrawn, liquidator_reward);
        let protocol_fee_balance = balance::split(&mut total_collateral_withdrawn, protocol_fee);
        // Remaining balance is the net liquidated collateral
        
        // 4. Convert balances to coins and transfer
        let mut liquidator_reward_coin = coin::from_balance<T>(liquidator_reward_balance, ctx);
        let net_liquidated_coin = coin::from_balance<T>(total_collateral_withdrawn, ctx);
        
        // Transfer liquidator reward + net collateral to liquidator
        coin::join(&mut liquidator_reward_coin, net_liquidated_coin);
        transfer::public_transfer(liquidator_reward_coin, tx_context::sender(ctx));
        
        // Transfer protocol fee to treasury (for now, we'll transfer to contract deployer)
        let protocol_fee_coin = coin::from_balance<T>(protocol_fee_balance, ctx);
        transfer::public_transfer(protocol_fee_coin, @0x20de068c090f53b54861ccce99d8b2d51ed245ea777ce6760677e339c2287a08); // Contract admin
        
        // 5. Update position collateral amount
        alp::reduce_position_collateral(position, collateral_to_liquidate);
        
        // 6. Get updated position info for event
        let (remaining_collateral, remaining_debt, _, _) = alp::get_position_info(position);
        
        // Transfer remaining ALP payment back to liquidator if any
        if (coin::value(&alp_payment) > 0) {
            transfer::public_transfer(alp_payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(alp_payment);
        };
        
        // Emit liquidation event
        event::emit(LiquidationExecuted {
            position_id: alp::get_position_id(position),
            liquidator: tx_context::sender(ctx),
            position_owner: alp::get_position_owner(position),
            alp_burned: liquidation_amount,
            collateral_liquidated: collateral_to_liquidate,
            liquidator_reward,
            protocol_fee,
            remaining_collateral,
            remaining_debt,
        });
    }
    
    /// Check if a position can be liquidated and return liquidation details
    public fun get_liquidation_info(
        position: &CollateralPosition,
        collateral_config: &CollateralConfig
    ): (bool, u64, u64, u64) {
        let is_liquidatable = alp::is_liquidatable(position, collateral_config);
        let health_factor = alp::calculate_health_factor(position, collateral_config);

        if (!is_liquidatable) {
            return (false, 0, 0, health_factor)
        };

        let (collateral_amount, alp_minted, _, _) = alp::get_position_info(position);
        
        // Calculate maximum liquidatable debt
        let max_liquidatable_debt = if (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) < (alp_minted as u128)) {
            (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) as u64)
        } else {
            alp_minted
        };
        
        // Calculate collateral that would be seized
        let (_, _, _, _, _, collateral_price, _) = alp::get_collateral_config(collateral_config);
        let liquidation_penalty = 130_000_000; // 13% penalty from protocol constants
        let penalty_multiplier = 1_000_000_000 + liquidation_penalty;
        let collateral_to_seize = if ((((max_liquidatable_debt as u128) * (penalty_multiplier as u128)) / (collateral_price as u128)) > (collateral_amount as u128)) {
            collateral_amount
        } else {
            (((max_liquidatable_debt as u128) * (penalty_multiplier as u128)) / (collateral_price as u128) as u64)
        };
        
        (is_liquidatable, max_liquidatable_debt, collateral_to_seize, health_factor)
    }
    
    /// Batch liquidation for multiple positions (simplified version)
    /// Note: This is a simplified implementation due to Move's reference constraints
    public fun batch_liquidate_simple(
        protocol_state: &mut ProtocolState,
        collateral_config: &mut CollateralConfig,
        position: &mut CollateralPosition,
        mut alp_payment: Coin<ALP>,
        ctx: &mut TxContext
    ) {
        let total_payment = coin::value(&alp_payment);

        if (alp::is_liquidatable(position, collateral_config)) {
            let (_, alp_minted, _, _) = alp::get_position_info(position);
            let max_liquidatable = if (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) < (alp_minted as u128)) {
                (((alp_minted as u128) * (MAX_LIQUIDATION_PERCENTAGE as u128) / 1_000_000_000) as u64)
            } else {
                alp_minted
            };

            let liquidation_amount = if (total_payment >= max_liquidatable) {
                max_liquidatable
            } else {
                total_payment
            };

            if (liquidation_amount > 0) {
                let payment_portion = coin::split(&mut alp_payment, liquidation_amount, ctx);

                // Burn the ALP tokens (simplified liquidation)
                alp::burn_alp_liquidation(protocol_state, collateral_config, position, payment_portion, ctx);
            };
        };

        // Return any unused ALP
        if (coin::value(&alp_payment) > 0) {
            transfer::public_transfer(alp_payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(alp_payment);
        };
    }

    // ======== View Functions ========
    
    /// Calculate liquidation penalty for a position
    public fun calculate_liquidation_penalty(
        position: &CollateralPosition,
        collateral_config: &CollateralConfig
    ): u64 {
        let health_factor = alp::calculate_health_factor(position, collateral_config);
        let (_, liquidation_threshold, _, _, _, _, _) = alp::get_collateral_config(collateral_config);
        
        if (health_factor >= liquidation_threshold) {
            return 0 // Not liquidatable
        };
        
        // Base penalty increases as health factor decreases
        let base_penalty = 130_000_000; // 13% penalty from protocol constants
        
        // Additional penalty based on how far below threshold
        let threshold_diff = liquidation_threshold - health_factor;
        let additional_penalty = (((threshold_diff as u128) * 50_000_000) / (liquidation_threshold as u128) as u64); // Up to 5% additional
        
        base_penalty + additional_penalty
    }
    
    /// Get liquidation statistics
    public fun get_liquidation_stats(
        positions: &vector<CollateralPosition>,
        collateral_config: &CollateralConfig
    ): (u64, u64, u64) {
        let total_positions = vector::length(positions);
        let mut liquidatable_positions = 0u64;
        let mut total_liquidatable_debt = 0u64;

        let mut i = 0;
        while (i < total_positions) {
            let position = vector::borrow(positions, i);
            if (alp::is_liquidatable(position, collateral_config)) {
                liquidatable_positions = liquidatable_positions + 1;
                let (_, debt, _, _) = alp::get_position_info(position);
                total_liquidatable_debt = total_liquidatable_debt + debt;
            };
            i = i + 1;
        };

        (total_positions, liquidatable_positions, total_liquidatable_debt)
    }

    // ======== Helper Functions ========
    
    /// Calculate optimal liquidation amount for maximum profit
    public fun calculate_optimal_liquidation(
        position: &CollateralPosition,
        collateral_config: &CollateralConfig,
        available_alp: u64
    ): u64 {
        let (is_liquidatable, max_liquidatable, _collateral_to_seize, _) = get_liquidation_info(position, collateral_config);

        if (!is_liquidatable) {
            return 0
        };

        // Return the minimum of available ALP and maximum liquidatable amount
        if (available_alp < max_liquidatable) {
            available_alp
        } else {
            max_liquidatable
        }
    }
}
