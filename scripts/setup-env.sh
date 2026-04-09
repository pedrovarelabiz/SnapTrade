#!/bin/bash

# Environment Setup Script
# This script helps you configure environment variables for the application

set -e

echo "=== Environment Setup ==="
echo ""

# Function to prompt for a variable
prompt_var() {
    local var_name=$1
    local description=$2
    local default_value=$3

    echo "$description"
    read -p "Enter $var_name [$default_value]: " value
    echo "${var_name}=${value:-$default_value}"
}

# Collect environment variables
ENV_VARS=""

echo "--- Sentry Configuration ---"
echo ""

# Sentry DSN for Backend
echo "SENTRY_DSN_BACKEND: Sentry Data Source Name for the backend application."
echo "This DSN is used to report errors and performance data from the backend service to Sentry."
read -p "Enter SENTRY_DSN_BACKEND (leave empty to skip): " SENTRY_DSN_BACKEND
ENV_VARS="${ENV_VARS}SENTRY_DSN_BACKEND=${SENTRY_DSN_BACKEND}\n"

echo ""

# Sentry DSN for Listener
echo "SENTRY_DSN_LISTENER: Sentry Data Source Name for the listener service."
echo "This DSN is used to report errors and performance data from the listener/worker service to Sentry."
read -p "Enter SENTRY_DSN_LISTENER (leave empty to skip): " SENTRY_DSN_LISTENER
ENV_VARS="${ENV_VARS}SENTRY_DSN_LISTENER=${SENTRY_DSN_LISTENER}\n"

echo ""

# Sentry DSN for Extension
echo "SENTRY_DSN_EXTENSION: Sentry Data Source Name for the browser extension."
echo "This DSN is used to report errors from the browser extension to Sentry."
read -p "Enter SENTRY_DSN_EXTENSION (leave empty to skip): " SENTRY_DSN_EXTENSION
ENV_VARS="${ENV_VARS}SENTRY_DSN_EXTENSION=${SENTRY_DSN_EXTENSION}\n"

echo ""
echo "--- Generating .env file ---"

# Generate .env file
ENV_FILE=".env"
echo -e "$ENV_VARS" > "$ENV_FILE"

echo ""
echo "✓ Environment file created: $ENV_FILE"
echo ""
echo "You can now edit $ENV_FILE to add or modify environment variables."
