-- ============================================================
-- Nexolise Billing — PostgreSQL Setup Script
-- Run this in pgAdmin 4 Query Tool on your target database
-- ============================================================

-- STEP 1: Create the database (run this as superuser in pgAdmin
--         connected to the 'postgres' database first)
-- CREATE DATABASE nexolise;
-- \c nexolise   ← then switch to it, or select it in pgAdmin

-- ============================================================
-- PART A: Application Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS packages (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  price            INTEGER NOT NULL,            -- KES, whole numbers
  duration_minutes INTEGER NOT NULL,
  speed_limit      TEXT DEFAULT 'unlimited',
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  checkout_id   TEXT UNIQUE NOT NULL,           -- our internal UUID
  phone         TEXT NOT NULL,                  -- 2547XXXXXXXX format
  mac           TEXT,                           -- client MAC from MikroTik
  ip            TEXT,                           -- client IP from MikroTik
  package_id    INTEGER REFERENCES packages(id),
  amount        INTEGER,                        -- actual KES charged
  mpesa_code    TEXT,                           -- e.g. RGH4XXXXXX
  status        TEXT DEFAULT 'pending',         -- pending | completed | failed
  radius_user   TEXT,                           -- generated RADIUS username
  radius_pass   TEXT,                           -- generated RADIUS password
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  payment_id  INTEGER REFERENCES payments(id),
  mac         TEXT,
  ip          TEXT,
  phone       TEXT,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  active      BOOLEAN DEFAULT true
);

-- ============================================================
-- PART B: FreeRADIUS SQL Schema Tables
-- (needed if FreeRADIUS points to this same database)
-- ============================================================

CREATE TABLE IF NOT EXISTS radcheck (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL DEFAULT '',
  attribute  TEXT NOT NULL DEFAULT '',
  op         CHAR(2) NOT NULL DEFAULT '==',
  value      TEXT NOT NULL DEFAULT '',
  UNIQUE(username, attribute)
);

CREATE TABLE IF NOT EXISTS radreply (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL DEFAULT '',
  attribute  TEXT NOT NULL DEFAULT '',
  op         CHAR(2) NOT NULL DEFAULT '=',
  value      TEXT NOT NULL DEFAULT '',
  UNIQUE(username, attribute)
);

CREATE TABLE IF NOT EXISTS radusergroup (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL DEFAULT '',
  groupname  TEXT NOT NULL DEFAULT '',
  priority   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS radgroupcheck (
  id         BIGSERIAL PRIMARY KEY,
  groupname  TEXT NOT NULL DEFAULT '',
  attribute  TEXT NOT NULL DEFAULT '',
  op         CHAR(2) NOT NULL DEFAULT '==',
  value      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS radgroupreply (
  id         BIGSERIAL PRIMARY KEY,
  groupname  TEXT NOT NULL DEFAULT '',
  attribute  TEXT NOT NULL DEFAULT '',
  op         CHAR(2) NOT NULL DEFAULT '=',
  value      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS radacct (
  radacctid           BIGSERIAL PRIMARY KEY,
  acctsessionid       TEXT NOT NULL DEFAULT '',
  acctuniqueid        TEXT NOT NULL DEFAULT '' UNIQUE,
  username            TEXT NOT NULL DEFAULT '',
  realm               TEXT DEFAULT '',
  nasipaddress        INET NOT NULL,
  nasportid           TEXT,
  nasporttype         TEXT,
  acctstarttime       TIMESTAMPTZ,
  acctupdatetime      TIMESTAMPTZ,
  acctstoptime        TIMESTAMPTZ,
  acctinterval        INTEGER,
  acctsessiontime     INTEGER,
  acctauthentic       TEXT,
  connectinfo_start   TEXT,
  connectinfo_stop    TEXT,
  acctinputoctets     BIGINT,
  acctoutputoctets    BIGINT,
  calledstationid     TEXT NOT NULL DEFAULT '',
  callingstationid    TEXT NOT NULL DEFAULT '',
  acctterminatecause  TEXT NOT NULL DEFAULT '',
  servicetype         TEXT,
  framedprotocol      TEXT,
  framedipaddress     INET,
  framedipv6address   INET,
  framedipv6prefix    INET,
  framedinterfaceid   TEXT,
  delegatedipv6prefix INET,
  class               TEXT
);

-- ============================================================
-- PART C: Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payments_checkout  ON payments(checkout_id);
CREATE INDEX IF NOT EXISTS idx_payments_phone     ON payments(phone);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);
CREATE INDEX IF NOT EXISTS idx_sessions_active    ON sessions(active, expires_at);
CREATE INDEX IF NOT EXISTS idx_radcheck_username  ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radreply_username  ON radreply(username);
CREATE INDEX IF NOT EXISTS idx_radacct_username   ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_session    ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasip      ON radacct(nasipaddress);

-- ============================================================
-- PART D: Seed default packages
-- ============================================================

INSERT INTO packages (name, price, duration_minutes, speed_limit)
SELECT * FROM (VALUES
  ('1 Hour',   10,  60,    'unlimited'),
  ('3 Hours',  20,  180,   'unlimited'),
  ('Daily',    50,  1440,  'unlimited'),
  ('Weekly',   200, 10080, 'unlimited'),
  ('Monthly',  500, 43200, 'unlimited')
) AS v(name, price, duration_minutes, speed_limit)
WHERE NOT EXISTS (SELECT 1 FROM packages LIMIT 1);

-- ============================================================
-- PART E: Verify everything was created
-- ============================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- You should see:
--   packages, payments, sessions,
--   radacct, radcheck, radgroupcheck, radgroupreply, radreply, radusergroup

SELECT * FROM packages ORDER BY price;
-- Should show your 5 default packages