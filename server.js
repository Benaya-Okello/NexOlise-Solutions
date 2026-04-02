// ============================================================
// Nexolise Billing Backend — server.js
// Node.js + Express | FreeRADIUS + M-Pesa Daraja API
// ============================================================

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const { Pool }   = require('pg');

const mpesaRoutes  = require('./routes/Mpesa')
const adminRoutes  = require('./routes/admin');
const { cleanExpiredSessions } = require('./helpers/radius');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Database ────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false
});

// Make db available to routes
app.use((req, _res, next) => { req.db = db; next(); });

// ── Routes ──────────────────────────────────────────────────
app.use('/api/pay',   mpesaRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date(), env: process.env.MPESA_ENV })
);

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`✅ Nexolise Billing running on port ${PORT}`);
  await initDB(db);

  // Clean up expired RADIUS users every 5 minutes
  setInterval(() => cleanExpiredSessions(db), 5 * 60 * 1000);
});

// ── DB Init ─────────────────────────────────────────────────
async function initDB(db) {
  await db.query(`
    -- ── Application tables ────────────────────────────────
    CREATE TABLE IF NOT EXISTS packages (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      price            INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      speed_limit      TEXT DEFAULT 'unlimited',
      active           BOOLEAN DEFAULT true,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id            SERIAL PRIMARY KEY,
      checkout_id   TEXT UNIQUE NOT NULL,
      phone         TEXT NOT NULL,
      mac           TEXT,
      ip            TEXT,
      package_id    INTEGER REFERENCES packages(id),
      amount        INTEGER,
      mpesa_code    TEXT,
      status        TEXT DEFAULT 'pending',
      radius_user   TEXT,
      radius_pass   TEXT,
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

    -- ── FreeRADIUS SQL schema tables ───────────────────────
    -- (required if you point freeradius at the same Supabase DB)
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
      radacctid          BIGSERIAL PRIMARY KEY,
      acctsessionid      TEXT NOT NULL DEFAULT '',
      acctuniqueid       TEXT NOT NULL DEFAULT '' UNIQUE,
      username           TEXT NOT NULL DEFAULT '',
      realm              TEXT DEFAULT '',
      nasipaddress       INET NOT NULL,
      nasportid          TEXT,
      nasporttype        TEXT,
      acctstarttime      TIMESTAMPTZ,
      acctupdatetime     TIMESTAMPTZ,
      acctstoptime       TIMESTAMPTZ,
      acctinterval       INTEGER,
      acctsessiontime    INTEGER,
      acctauthentic      TEXT,
      connectinfo_start  TEXT,
      connectinfo_stop   TEXT,
      acctinputoctets    BIGINT,
      acctoutputoctets   BIGINT,
      calledstationid    TEXT NOT NULL DEFAULT '',
      callingstationid   TEXT NOT NULL DEFAULT '',
      acctterminatecause TEXT NOT NULL DEFAULT '',
      servicetype        TEXT,
      framedprotocol     TEXT,
      framedipaddress    INET,
      framedipv6address  INET,
      framedipv6prefix   INET,
      framedinterfaceid  TEXT,
      delegatedipv6prefix INET,
      class              TEXT
    );

    CREATE INDEX IF NOT EXISTS radacct_username   ON radacct(username);
    CREATE INDEX IF NOT EXISTS radacct_session    ON radacct(acctsessionid);
    CREATE INDEX IF NOT EXISTS radacct_nasip      ON radacct(nasipaddress);
    CREATE INDEX IF NOT EXISTS radcheck_username  ON radcheck(username);
    CREATE INDEX IF NOT EXISTS radreply_username  ON radreply(username);

    -- ── Seed default packages if table is empty ────────────
    INSERT INTO packages (name, price, duration_minutes, speed_limit)
    SELECT * FROM (VALUES
      ('1 Hour',   10,  60,    'unlimited'),
      ('3 Hours',  20,  180,   'unlimited'),
      ('Daily',    50,  1440,  'unlimited'),
      ('Weekly',   200, 10080, 'unlimited'),
      ('Monthly',  500, 43200, 'unlimited')
    ) AS v(name, price, duration_minutes, speed_limit)
    WHERE NOT EXISTS (SELECT 1 FROM packages LIMIT 1);
  `);

  console.log('✅ Database ready (all tables verified)');
}
