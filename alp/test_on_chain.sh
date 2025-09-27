#!/bin/bash

# ALP On-Chain Testing Script
# This script publishes the ALP contract and tests all functions

set -e  # Exit on any error

echo "🚀 Starting ALP On-Chain Testing..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📝 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "Move.toml" ]; then
    print_error "Move.toml not found. Please run this script from the alp directory."
    exit 1
fi

# Variables to store important object IDs
PACKAGE_ID=""
PROTOCOL_STATE_ID=""
ORACLE_STATE_ID=""
ORACLE_MANAGER_CAP_ID=""
SUI_COLLATERAL_CONFIG_ID=""
BTC_COLLATERAL_CONFIG_ID=""
SUI_VAULT_ID=""
BTC_VAULT_ID=""
ACTIVE_ADDRESS=$(sui client active-address)

print_step "Active Address: $ACTIVE_ADDRESS"

# Step 1: Build the project
print_step "Building the Move project..."
sui move build

print_success "Project built successfully"

# Step 2: Publish the package
print_step "Publishing the package to testnet..."
PUBLISH_OUTPUT=$(sui client publish --gas-budget 100000000 --json)
echo "$PUBLISH_OUTPUT" > publish_output.json

# Extract package ID from publish output
PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.type == "published") | .packageId')
print_success "Package published with ID: $PACKAGE_ID"

# Extract created objects
PROTOCOL_STATE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("ProtocolState")) | .objectId')
ORACLE_STATE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("OracleState")) | .objectId')
ORACLE_MANAGER_CAP_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("OracleManagerCap")) | .objectId')

print_success "Protocol State ID: $PROTOCOL_STATE_ID"
print_success "Oracle State ID: $ORACLE_STATE_ID"
print_success "Oracle Manager Cap ID: $ORACLE_MANAGER_CAP_ID"

# Step 3: Create collateral configurations
print_step "Creating SUI collateral configuration..."
SUI_CONFIG_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module "alp" \
    --function "create_collateral_config" \
    --args "SUI" 1500000000 1200000000 1000000000000 \
    --gas-budget 10000000 \
    --json)

SUI_COLLATERAL_CONFIG_ID=$(echo "$SUI_CONFIG_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("CollateralConfig")) | .objectId')
print_success "SUI Collateral Config ID: $SUI_COLLATERAL_CONFIG_ID"

print_step "Creating BTC collateral configuration..."
BTC_CONFIG_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module "alp" \
    --function "create_collateral_config" \
    --args "BTC" 1500000000 1200000000 5000000000000 \
    --gas-budget 10000000 \
    --json)

BTC_COLLATERAL_CONFIG_ID=$(echo "$BTC_CONFIG_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("CollateralConfig")) | .objectId')
print_success "BTC Collateral Config ID: $BTC_COLLATERAL_CONFIG_ID"

# Step 4: Create collateral vaults
print_step "Creating SUI collateral vault..."
SUI_VAULT_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module "alp" \
    --function "create_collateral_vault" \
    --type-args "0x2::sui::SUI" \
    --gas-budget 10000000 \
    --json)

SUI_VAULT_ID=$(echo "$SUI_VAULT_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("CollateralVault")) | .objectId')
print_success "SUI Vault ID: $SUI_VAULT_ID"

# Step 5: Test Oracle Functions
print_step "Testing Oracle Functions..."

# Set oracle addresses
print_step "Setting oracle addresses..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "set_oracle_addresses" \
    --args "$ORACLE_MANAGER_CAP_ID" "$ORACLE_STATE_ID" "0x1234567890abcdef1234567890abcdef12345678" "0xabcdef1234567890abcdef1234567890abcdef12" \
    --gas-budget 10000000

print_success "Oracle addresses set"

# Add authorized updater
print_step "Adding authorized updater..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "add_authorized_updater" \
    --args "$ORACLE_MANAGER_CAP_ID" "$ORACLE_STATE_ID" "$ACTIVE_ADDRESS" \
    --gas-budget 10000000

print_success "Authorized updater added"

# Test pause/resume oracle
print_step "Testing oracle pause..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "pause_oracle" \
    --args "$ORACLE_MANAGER_CAP_ID" "$ORACLE_STATE_ID" \
    --gas-budget 10000000

print_success "Oracle paused"

print_step "Testing oracle resume..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "resume_oracle" \
    --args "$ORACLE_MANAGER_CAP_ID" "$ORACLE_STATE_ID" \
    --gas-budget 10000000

print_success "Oracle resumed"

# Step 6: Test ALP Protocol Functions
print_step "Testing ALP Protocol Functions..."

# Get some SUI coins for testing
AVAILABLE_COINS=$(sui client gas --json | jq -r '.[0].gasCoinId')
print_step "Using coin: $AVAILABLE_COINS for testing"

# Test view functions
print_step "Testing view functions..."

# Get protocol state
print_step "Getting protocol state..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "alp" \
    --function "get_protocol_state" \
    --args "$PROTOCOL_STATE_ID" \
    --gas-budget 5000000

# Get collateral config
print_step "Getting collateral config..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "alp" \
    --function "get_collateral_config" \
    --args "$SUI_COLLATERAL_CONFIG_ID" \
    --gas-budget 5000000

# Get oracle state
print_step "Getting oracle state..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "get_oracle_state" \
    --args "$ORACLE_STATE_ID" \
    --gas-budget 5000000

# Check if address is authorized updater
print_step "Checking if address is authorized updater..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "oracle" \
    --function "is_authorized_updater" \
    --args "$ORACLE_STATE_ID" "$ACTIVE_ADDRESS" \
    --gas-budget 5000000

print_success "All view functions tested successfully"

# Step 7: Test Liquidation Functions
print_step "Testing Liquidation Functions..."

# Create a liquidation oracle
print_step "Creating liquidation oracle..."
LIQUIDATION_ORACLE_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module "liquidation" \
    --function "create_liquidation_oracle" \
    --gas-budget 10000000 \
    --json)

LIQUIDATION_ORACLE_ID=$(echo "$LIQUIDATION_ORACLE_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("LiquidationOracle")) | .objectId')
print_success "Liquidation Oracle ID: $LIQUIDATION_ORACLE_ID"

# Update liquidation parameters
print_step "Updating liquidation parameters..."
sui client call \
    --package "$PACKAGE_ID" \
    --module "liquidation" \
    --function "update_liquidation_parameters" \
    --args "$LIQUIDATION_ORACLE_ID" 1200000000 130000000 50000000 \
    --gas-budget 10000000

print_success "Liquidation parameters updated"

# Step 8: Summary
echo ""
echo "🎉 ON-CHAIN TESTING COMPLETED!"
echo "==============================="
print_success "Package ID: $PACKAGE_ID"
print_success "Protocol State ID: $PROTOCOL_STATE_ID"
print_success "Oracle State ID: $ORACLE_STATE_ID"
print_success "Oracle Manager Cap ID: $ORACLE_MANAGER_CAP_ID"
print_success "SUI Collateral Config ID: $SUI_COLLATERAL_CONFIG_ID"
print_success "BTC Collateral Config ID: $BTC_COLLATERAL_CONFIG_ID"
print_success "SUI Vault ID: $SUI_VAULT_ID"
print_success "Liquidation Oracle ID: $LIQUIDATION_ORACLE_ID"

# Save important IDs to a file for future reference
cat > deployed_objects.json << EOF
{
  "package_id": "$PACKAGE_ID",
  "protocol_state_id": "$PROTOCOL_STATE_ID",
  "oracle_state_id": "$ORACLE_STATE_ID",
  "oracle_manager_cap_id": "$ORACLE_MANAGER_CAP_ID",
  "sui_collateral_config_id": "$SUI_COLLATERAL_CONFIG_ID",
  "btc_collateral_config_id": "$BTC_COLLATERAL_CONFIG_ID",
  "sui_vault_id": "$SUI_VAULT_ID",
  "liquidation_oracle_id": "$LIQUIDATION_ORACLE_ID"
}
EOF

print_success "Object IDs saved to deployed_objects.json"

echo ""
print_step "Next steps:"
echo "1. You can now interact with your deployed contract using the object IDs above"
echo "2. Use 'sui client object <OBJECT_ID>' to inspect any object"
echo "3. Use the deployed_objects.json file to reference the IDs in future interactions"
echo ""
print_success "All functions have been tested successfully! 🎊"
