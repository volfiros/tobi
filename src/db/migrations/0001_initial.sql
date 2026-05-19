CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp_number TEXT,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_pricing_rules (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  paper_size TEXT NOT NULL,
  color_mode TEXT NOT NULL,
  side_mode TEXT NOT NULL,
  price_per_page_paise INTEGER NOT NULL,
  binding_type TEXT,
  binding_price_paise INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT DEFAULT 'INR',
  total_paise INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'not_started',
  payment_provider TEXT,
  payment_id TEXT,
  payment_link_id TEXT,
  payment_link TEXT,
  pickup_code TEXT,
  quote_snapshot_json TEXT,
  print_options_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE IF NOT EXISTS order_files (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  page_count INTEGER,
  file_size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  order_id TEXT,
  direction TEXT NOT NULL,
  provider TEXT NOT NULL,
  processing_status TEXT DEFAULT 'completed' NOT NULL,
  provider_message_id TEXT,
  body TEXT,
  media_count INTEGER DEFAULT 0,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_id
ON messages(provider_message_id)
WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_order_id TEXT,
  amount_paise INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
ON payments(provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
