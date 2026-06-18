-- ============================================
-- N8N Schema Setup for Supabase
-- ============================================
-- Run this in your Supabase SQL Editor before deploying N8N
-- This creates the necessary schema and permissions for N8N

-- Create N8N schema (keeps N8N tables separate from your app)
CREATE SCHEMA IF NOT EXISTS n8n;

-- Grant all privileges to the postgres user (or your Supabase service role)
GRANT ALL PRIVILEGES ON SCHEMA n8n TO postgres;

-- Grant privileges on all existing tables (if any)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA n8n TO postgres;

-- Grant privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA n8n TO postgres;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n 
GRANT ALL PRIVILEGES ON TABLES TO postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA n8n 
GRANT ALL PRIVILEGES ON SEQUENCES TO postgres;

-- Verify schema creation
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'n8n';

-- ============================================
-- Expected Result:
-- schema_name
-- -----------
-- n8n
-- ============================================

-- NOTE: N8N will automatically create its own tables on first startup:
-- - workflow_entity
-- - credentials_entity
-- - execution_entity
-- - webhook_entity
-- - tag_entity
-- - settings
-- - installed_packages
-- - installed_nodes
-- 
-- You do NOT need to create these manually.
-- ============================================

-- Optional: Create a read-only user for monitoring (if needed)
-- CREATE USER n8n_readonly WITH PASSWORD 'your-readonly-password';
-- GRANT USAGE ON SCHEMA n8n TO n8n_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA n8n TO n8n_readonly;
