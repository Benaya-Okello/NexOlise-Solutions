# ============================================================
# Nexolise Billing — Complete Deployment Guide
# ============================================================

## WHAT YOU'RE SETTING UP
  [MikroTik] ←→ [FreeRADIUS on Oracle VPS] ←→ [Node.js on Railway]
                                                        ↑
                                               [Supabase PostgreSQL]
                                                        ↑
                                               [Daraja M-Pesa API]

---

## STEP 1: Create Free Accounts

### A. Supabase (Database) — free.supabase.com
1. Sign up at https://supabase.com
2. Create new project → name it "nexolise-billing"
3. Choose region: Mumbai (closest to Kenya)
4. Go to Settings → Database → Copy "Connection string (URI)"
5. Save it — this is your DATABASE_URL

### B. Oracle Cloud (Free VPS for FreeRADIUS) — oracle.com/cloud/free
1. Sign up at https://oracle.com/cloud/free
2. Create a "VM.Standard.E2.1.Micro" instance (always free)
3. Choose Ubuntu 22.04
4. Download the private key when prompted
5. Note your public IP address

### C. Railway (Node.js Backend) — railway.app
1. Sign up at https://railway.app (500hrs/month free)
2. We'll deploy here in Step 4

---

## STEP 2: Set Up FreeRADIUS on Oracle VPS

SSH into your Oracle VPS:
```bash
ssh -i your-key.pem ubuntu@YOUR-ORACLE-IP
```

Run this full setup script:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install FreeRADIUS + PostgreSQL client
sudo apt install -y freeradius freeradius-postgresql postgresql-client

# Install WireGuard (for MikroTik tunnel)
sudo apt install -y wireguard

# Allow RADIUS ports in Oracle firewall
sudo iptables -I INPUT -p udp --dport 1812 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 1813 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 1812 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

Configure FreeRADIUS to use PostgreSQL (Supabase):
```bash
sudo nano /etc/freeradius/3.0/mods-available/sql
```

Change these lines:
```
driver = "rlm_sql_postgresql"
dialect = "postgresql"
server = "db.YOUR-PROJECT.supabase.co"
port = 5432
login = "postgres"
password = "YOUR-SUPABASE-PASSWORD"
radius_db = "postgres"
```

Enable the SQL module:
```bash
sudo ln -s /etc/freeradius/3.0/mods-available/sql \
           /etc/freeradius/3.0/mods-enabled/sql
```

Edit clients.conf to allow your MikroTik:
```bash
sudo nano /etc/freeradius/3.0/clients.conf
```
Add at the bottom:
```
client mikrotik-kongoni {
    ipaddr = YOUR-MIKROTIK-PUBLIC-IP
    secret = nexolise-radius-secret-2024
    shortname = kongoni
}

# Allow all (for WireGuard tunnel)
client wireguard-subnet {
    ipaddr = 10.9.0.0/16
    secret = nexolise-radius-secret-2024
    shortname = vpn
}
```

Restart FreeRADIUS:
```bash
sudo systemctl restart freeradius
sudo systemctl enable freeradius
sudo systemctl status freeradius
```

Test it's working:
```bash
sudo freeradius -X  # Debug mode - should show "Ready to process requests"
```

---

## STEP 3: Update MikroTik RADIUS Settings

In Winbox Terminal:
```bash
# Remove old RADIUS entries
/radius remove [find]

# Add your Oracle VPS as RADIUS server
/radius add address=YOUR-ORACLE-VPS-IP \
    secret=nexolise-radius-secret-2024 \
    service=hotspot timeout=3s

# Make sure incoming RADIUS is enabled
/radius incoming set accept=yes port=1700
```

---

## STEP 4: Deploy Backend to Railway

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. In your backend folder:
```bash
railway login
railway init
railway up
```

3. Set environment variables in Railway dashboard:
   - DATABASE_URL = your Supabase connection string
   - MPESA_ENV = production (or sandbox for testing)
   - MPESA_CONSUMER_KEY = from developer.safaricom.co.ke
   - MPESA_CONSUMER_SECRET = from developer.safaricom.co.ke
   - MPESA_SHORTCODE = your paybill/till number
   - MPESA_PASSKEY = from Safaricom portal
   - MPESA_CALLBACK_URL = https://YOUR-APP.railway.app/api/pay/callback
   - ADMIN_API_KEY = make up a long random string

4. Railway gives you a URL like:
   https://nexolise-billing-production.up.railway.app

---

## STEP 5: Upload Captive Portal to MikroTik

1. Open Winbox → Files
2. Create folder: centipid-hotspot (or your hotspot html-directory name)
3. Edit login.html — replace:
   ```
   const BACKEND_URL = 'https://YOUR-RAILWAY-APP.railway.app';
   ```
   with your actual Railway URL

4. Drag login.html into the folder in Winbox Files

---

## STEP 6: Get Daraja API Credentials

1. Go to https://developer.safaricom.co.ke
2. Create an app
3. For sandbox testing, use these test credentials:
   - Shortcode: 174379
   - Test phone: 254708374149
   - Passkey: (from developer portal)
4. When ready for production, apply for Go-Live

---

## STEP 7: Test the Full Flow

1. Connect a phone to "NexOlise HotSpot"
2. Open a browser — captive portal should appear
3. Select a package, enter phone number
4. M-Pesa STK push should arrive on your phone
5. Enter PIN → internet unlocks
6. Check admin dashboard to see the session

---

## TROUBLESHOOTING

Problem: STK Push not arriving
→ Check your MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET
→ Make sure MPESA_CALLBACK_URL is publicly accessible
→ Check Railway logs: railway logs

Problem: Internet doesn't unlock after payment
→ Check FreeRADIUS logs: sudo journalctl -u freeradius -f
→ Verify MikroTik can reach your Oracle VPS IP on port 1812
→ Check RADIUS secret matches on both sides

Problem: Captive portal doesn't appear
→ Review the wlan1 bridge port troubleshooting steps
→ Make sure hotspot HTML files are in the correct folder

---

## COSTS SUMMARY

| Service | Free Tier | When You Outgrow It |
|---------|-----------|---------------------|
| Supabase | 500MB, unlimited | $25/mo for 8GB |
| Oracle VPS | Always free 1GB | Buy bigger VPS |
| Railway | 500hrs/mo | $5/mo for always-on |
| Daraja | Free | Transaction fees only |

You can serve hundreds of clients on the free tier easily.

---

Nexolise Billing — Built for Kenya 🇰🇪
