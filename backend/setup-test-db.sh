#!/bin/bash
# Setup script for test database

set -e

echo "Setting up test database..."

# Create SQL commands
cat > /tmp/setup-db.sql << 'EOF'
-- Create maestro user if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'maestro') THEN
    CREATE USER maestro WITH PASSWORD 'password';
  END IF;
END
$$;

-- Create postgres user with password if needed
ALTER USER postgres WITH PASSWORD 'postgres';

-- Create test database if it doesn't exist
SELECT 'CREATE DATABASE snaptrade_test OWNER maestro'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'snaptrade_test')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE snaptrade_test TO maestro;
ALTER USER maestro CREATEDB;

\c snaptrade_test
GRANT ALL ON SCHEMA public TO maestro;
EOF

echo "Executing SQL setup commands..."
# Try to execute as postgres user using peer authentication
if command -v sudo &> /dev/null; then
    sudo -u postgres psql -f /tmp/setup-db.sql
else
    # If sudo doesn't work, try direct connection
    psql -U postgres -f /tmp/setup-db.sql
fi

# Cleanup
rm -f /tmp/setup-db.sql

echo "✓ Database setup complete!"
echo "  User: maestro"
echo "  Password: password"
echo "  Database: snaptrade_test"
