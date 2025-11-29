#!/bin/bash

# Nuit de l'Info - Interactive Deployment Script
# =============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_color() {
    printf "${1}${2}${NC}\n"
}

print_header() {
    echo ""
    print_color "$BLUE" "================================================"
    print_color "$BLUE" "  $1"
    print_color "$BLUE" "================================================"
    echo ""
}

print_step() {
    print_color "$YELLOW" "=> $1"
}

print_success() {
    print_color "$GREEN" "✓ $1"
}

print_error() {
    print_color "$RED" "✗ $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Confirm action
confirm() {
    read -p "$1 [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Main deployment script
main() {
    print_header "NDI Registration - Deployment"

    # Check prerequisites
    print_step "Checking prerequisites..."

    if ! command_exists bun; then
        print_error "bun is not installed. Please install it: https://bun.sh"
        exit 1
    fi
    print_success "bun found: $(bun --version)"

    if ! command_exists npx; then
        print_error "npx is not installed. Please install Node.js"
        exit 1
    fi
    print_success "npx found"

    # Check if logged in to Cloudflare
    print_step "Checking Cloudflare authentication..."
    if ! bunx wrangler whoami 2>/dev/null | grep -q "You are logged in"; then
        print_color "$YELLOW" "Not logged in to Cloudflare."
        if confirm "Would you like to login now?"; then
            bunx wrangler login
        else
            print_error "Cloudflare login required for deployment"
            exit 1
        fi
    fi
    print_success "Authenticated with Cloudflare"

    # Menu
    echo ""
    print_color "$BLUE" "What would you like to do?"
    echo "1) Run tests only"
    echo "2) Deploy to production"
    echo "3) Deploy to preview (development)"
    echo "4) Initialize database (first-time setup)"
    echo "5) Generate new admin token"
    echo "6) View current deployment"
    echo "7) View logs (tail)"
    echo "8) Full setup (install + test + deploy)"
    echo "0) Exit"
    echo ""

    read -p "Select an option [0-8]: " choice

    case $choice in
        1)
            run_tests
            ;;
        2)
            deploy_production
            ;;
        3)
            deploy_preview
            ;;
        4)
            init_database
            ;;
        5)
            generate_token
            ;;
        6)
            view_deployment
            ;;
        7)
            view_logs
            ;;
        8)
            full_setup
            ;;
        0)
            print_color "$GREEN" "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            exit 1
            ;;
    esac
}

run_tests() {
    print_header "Running Tests"

    print_step "Installing dependencies..."
    bun install

    print_step "Running test suite..."
    if bun run test; then
        print_success "All tests passed!"
    else
        print_error "Tests failed. Fix issues before deploying."
        exit 1
    fi
}

deploy_production() {
    print_header "Deploying to Production"

    if ! confirm "Are you sure you want to deploy to PRODUCTION?"; then
        print_color "$YELLOW" "Deployment cancelled"
        return
    fi

    print_step "Installing dependencies..."
    bun install

    print_step "Running tests..."
    if ! bun run test; then
        print_error "Tests failed. Aborting deployment."
        exit 1
    fi

    print_step "Deploying to Cloudflare Workers..."
    bunx wrangler deploy

    print_success "Deployment complete!"
    echo ""
    print_color "$GREEN" "Your app is live!"
}

deploy_preview() {
    print_header "Deploying to Preview"

    print_step "Installing dependencies..."
    bun install

    print_step "Deploying preview..."
    bunx wrangler deploy --env preview 2>/dev/null || bunx wrangler deploy

    print_success "Preview deployment complete!"
}

init_database() {
    print_header "Database Initialization"

    print_color "$YELLOW" "This will initialize the D1 database schema."
    print_color "$YELLOW" "WARNING: Only run this on a fresh database!"
    echo ""

    if ! confirm "Continue with database initialization?"; then
        print_color "$YELLOW" "Initialization cancelled"
        return
    fi

    # Check if database ID is configured
    if ! grep -q "database_id" wrangler.toml; then
        print_color "$YELLOW" "No database configured. Creating new D1 database..."

        read -p "Enter database name [ndi-registration]: " db_name
        db_name=${db_name:-ndi-registration}

        bunx wrangler d1 create "$db_name"
        print_color "$YELLOW" "Please add the database configuration to wrangler.toml"
        return
    fi

    print_step "Applying schema..."
    bunx wrangler d1 execute ndi-registration --file=./db/schema.sql --remote

    print_success "Database initialized!"
}

generate_token() {
    print_header "Generate Admin Token"

    print_step "Generating secure token..."
    NEW_TOKEN=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)

    echo ""
    print_color "$GREEN" "New Admin Token: $NEW_TOKEN"
    echo ""
    print_color "$YELLOW" "Save this token securely! You'll need it to access the admin panel."
    echo ""

    if confirm "Would you like to store this token in KV?"; then
        bunx wrangler kv:key put --namespace-id="$KV_NAMESPACE_ID" "admin_token" "$NEW_TOKEN" 2>/dev/null || {
            print_color "$YELLOW" "Could not store in KV. Please add manually to your environment."
        }
    fi

    echo ""
    print_color "$BLUE" "To use this token:"
    echo "  1. Go to your admin panel: /admin"
    echo "  2. Enter the token: $NEW_TOKEN"
    echo ""
}

view_deployment() {
    print_header "Current Deployment"

    print_step "Fetching deployment info..."
    bunx wrangler deployments list 2>/dev/null || {
        print_color "$YELLOW" "No deployments found or unable to fetch."
    }
}

view_logs() {
    print_header "Viewing Logs"

    print_color "$YELLOW" "Press Ctrl+C to stop"
    echo ""

    bunx wrangler tail
}

full_setup() {
    print_header "Full Setup"

    print_step "Installing dependencies..."
    bun install

    print_step "Running tests..."
    if ! bun run test; then
        print_error "Tests failed. Please fix before continuing."
        exit 1
    fi
    print_success "Tests passed"

    # Check if this is first deployment
    if ! bunx wrangler deployments list 2>/dev/null | grep -q "Created"; then
        print_color "$YELLOW" "First-time setup detected"

        # Create D1 database if needed
        if ! grep -q "database_id" wrangler.toml || grep -q "YOUR_DATABASE_ID" wrangler.toml; then
            print_step "Creating D1 database..."
            bunx wrangler d1 create ndi-registration
            print_color "$YELLOW" "Please update wrangler.toml with the database ID, then re-run this script."
            exit 0
        fi

        # Create KV namespace if needed
        if ! grep -q "kv_namespaces" wrangler.toml || grep -q "YOUR_KV_ID" wrangler.toml; then
            print_step "Creating KV namespace..."
            bunx wrangler kv:namespace create CONFIG
            print_color "$YELLOW" "Please update wrangler.toml with the KV namespace ID, then re-run this script."
            exit 0
        fi
    fi

    print_step "Deploying..."
    bunx wrangler deploy

    # Check if database needs initialization
    if confirm "Would you like to initialize the database schema?"; then
        print_step "Applying database schema..."
        bunx wrangler d1 execute ndi-registration --file=./db/schema.sql --remote
        print_success "Database schema applied"
    fi

    # Generate admin token
    if confirm "Would you like to generate an admin token?"; then
        generate_token
    fi

    print_success "Setup complete!"
    echo ""
    print_color "$GREEN" "Your NDI Registration system is now live!"
    echo ""
}

# Run main function
main "$@"
