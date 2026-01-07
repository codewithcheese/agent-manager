#!/bin/sh
set -e

echo "Environment check..."
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL is set: $([ -z "$DATABASE_URL" ] && echo "NO" || echo "YES")"

echo "Running database migrations..."
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
fi

./node_modules/.bin/drizzle-kit push --force || {
    echo "ERROR: Migration failed"
    exit 1
}

echo "Database migrations completed successfully"
echo "Starting application..."
exec node build
