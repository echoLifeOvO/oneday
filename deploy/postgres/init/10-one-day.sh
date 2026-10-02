#!/usr/bin/env bash
set -euo pipefail
export ONE_DAY_OWNER_PASSWORD="$(cat /run/secrets/owner_password)"
export ONE_DAY_APP_PASSWORD="$(cat /run/secrets/app_password)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv owner_password ONE_DAY_OWNER_PASSWORD
\getenv app_password ONE_DAY_APP_PASSWORD
CREATE ROLE one_day_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'owner_password';
CREATE ROLE one_day_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 30 PASSWORD :'app_password';
CREATE DATABASE one_day OWNER one_day_owner;
REVOKE CONNECT ON DATABASE one_day FROM PUBLIC;
GRANT CONNECT ON DATABASE one_day TO one_day_app;
\connect one_day
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO one_day_app;
ALTER DEFAULT PRIVILEGES FOR ROLE one_day_owner IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO one_day_app;
SQL
unset ONE_DAY_OWNER_PASSWORD ONE_DAY_APP_PASSWORD
