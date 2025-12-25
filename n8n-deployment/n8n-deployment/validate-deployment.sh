#!/bin/bash

# ============================================
# N8N Railway Deployment Validation Script
# ============================================
# This script helps validate your N8N deployment configuration
# Run this before deploying to catch common issues

set -e

echo "🚀 N8N Railway Deployment Validator"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists (for local testing)
if [ -f ".env" ]; then
    echo "${GREEN}✓${NC} Found .env file for local testing"
    source .env
else
    echo "${YELLOW}⚠${NC}  No .env file found (this is OK for Railway deployment)"
    echo "   Railway will use environment variables from the dashboard"
fi

echo ""
echo "Checking required files..."
echo "-------------------------"

# Check Dockerfile
if [ -f "Dockerfile" ]; then
    echo "${GREEN}✓${NC} Dockerfile exists"
else
    echo "${RED}✗${NC} Dockerfile missing!"
    exit 1
fi

# Check railway.json
if [ -f "railway.json" ]; then
    echo "${GREEN}✓${NC} railway.json exists"
else
    echo "${RED}✗${NC} railway.json missing!"
    exit 1
fi

# Check .dockerignore
if [ -f ".dockerignore" ]; then
    echo "${GREEN}✓${NC} .dockerignore exists"
else
    echo "${YELLOW}⚠${NC}  .dockerignore missing (recommended but not required)"
fi

# Check README
if [ -f "README.md" ]; then
    echo "${GREEN}✓${NC} README.md exists"
else
    echo "${YELLOW}⚠${NC}  README.md missing"
fi

echo ""
echo "Environment Variables Checklist:"
echo "-------------------------------"

# Function to check if variable is set
check_env() {
    local var_name=$1
    local is_critical=$2
    
    if [ -z "${!var_name}" ]; then
        if [ "$is_critical" = "true" ]; then
            echo "${RED}✗${NC} $var_name not set (CRITICAL)"
        else
            echo "${YELLOW}⚠${NC}  $var_name not set (optional)"
        fi
        return 1
    else
        echo "${GREEN}✓${NC} $var_name is set"
        return 0
    fi
}

# Critical variables
echo ""
echo "Critical Variables (must be set in Railway):"
check_env "N8N_PORT" "true" || echo "   Set to: 5678"
check_env "N8N_PROTOCOL" "true" || echo "   Set to: https"
check_env "DB_TYPE" "true" || echo "   Set to: postgresdb"
check_env "N8N_ENCRYPTION_KEY" "true" || echo "   Generate with: openssl rand -base64 32"
check_env "N8N_BASIC_AUTH_USER" "true" || echo "   Set your admin username"
check_env "N8N_BASIC_AUTH_PASSWORD" "true" || echo "   Set a strong password"

echo ""
echo "Database Variables:"
if [ -z "$DB_POSTGRESDB_CONNECTION_URL" ]; then
    echo "${YELLOW}⚠${NC}  DB_POSTGRESDB_CONNECTION_URL not set"
    echo "   Required format: postgresql://user:pass@host:port/db"
    echo "   Or set individual DB_POSTGRESDB_* variables"
else
    echo "${GREEN}✓${NC} DB_POSTGRESDB_CONNECTION_URL is set"
fi

check_env "DB_POSTGRESDB_SCHEMA" "false" || echo "   Recommended: n8n"

echo ""
echo "Optional but Recommended:"
check_env "GENERIC_TIMEZONE" "false" || echo "   Set to your timezone (e.g., America/Chicago)"
check_env "N8N_CORS_ENABLED" "false" || echo "   Set to: true"
check_env "N8N_CORS_ORIGINS" "false" || echo "   Set to your frontend/backend domains"
check_env "EXECUTIONS_PROCESS" "false" || echo "   Set to: main (recommended for Railway)"

echo ""
echo "Integration Variables (add when ready):"
check_env "GOOGLE_CLIENT_ID" "false"
check_env "GOOGLE_CLIENT_SECRET" "false"
check_env "OPENAI_API_KEY" "false"

echo ""
echo "Pre-Deployment Checklist:"
echo "------------------------"

echo "□ Supabase database is accessible"
echo "□ Run supabase-init.sql in Supabase SQL Editor"
echo "□ Generated strong N8N_ENCRYPTION_KEY"
echo "□ Set secure N8N_BASIC_AUTH_PASSWORD"
echo "□ Configured Google Cloud OAuth credentials"
echo "□ Added OAuth redirect URI: https://[your-domain]/rest/oauth2-credential/callback"
echo "□ Enabled Gmail API and Google Calendar API"
echo "□ Set up Railway service with proper environment variables"
echo "□ Configured CORS origins for your frontend/backend"

echo ""
echo "Post-Deployment Checklist:"
echo "-------------------------"
echo "□ Verify N8N is accessible at Railway URL"
echo "□ Login to N8N UI with basic auth credentials"
echo "□ Add Google OAuth credentials in N8N UI"
echo "□ Create test workflow"
echo "□ Test webhook endpoint from NestJS backend"
echo "□ Monitor Railway logs for errors"

echo ""
echo "Useful Commands:"
echo "---------------"
echo "Generate encryption key:"
echo "  openssl rand -base64 32"
echo ""
echo "Generate secure password:"
echo "  openssl rand -base64 24"
echo ""
echo "Test N8N health (after deployment):"
echo "  curl https://[your-n8n-domain].up.railway.app/healthz"
echo ""
echo "Railway CLI commands:"
echo "  railway login"
echo "  railway link"
echo "  railway up"
echo "  railway logs"
echo ""

echo "${GREEN}Validation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Copy .env.example and configure environment variables in Railway"
echo "2. Run supabase-init.sql in your Supabase SQL Editor"
echo "3. Deploy to Railway using dashboard or CLI"
echo "4. Follow post-deployment steps in README.md"
