INSERT OR IGNORE INTO shops (id, name, whatsapp_number, address, timezone, is_active, created_at, updated_at)
VALUES ('shop_demo', 'Tobi Demo Print Shop', 'whatsapp:+910000000001', 'Demo pickup counter', 'Asia/Kolkata', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO shop_pricing_rules (id, shop_id, paper_size, color_mode, side_mode, price_per_page_paise, binding_type, binding_price_paise, created_at, updated_at)
VALUES
  ('rule_a4_bw_single', 'shop_demo', 'A4', 'black_and_white', 'single_sided', 200, NULL, 0, datetime('now'), datetime('now')),
  ('rule_a4_bw_double', 'shop_demo', 'A4', 'black_and_white', 'double_sided', 150, NULL, 0, datetime('now'), datetime('now')),
  ('rule_a4_color_single', 'shop_demo', 'A4', 'color', 'single_sided', 1000, NULL, 0, datetime('now'), datetime('now')),
  ('rule_a4_color_double', 'shop_demo', 'A4', 'color', 'double_sided', 800, NULL, 0, datetime('now'), datetime('now')),
  ('bind_none', 'shop_demo', 'A4', 'black_and_white', 'single_sided', 0, 'none', 0, datetime('now'), datetime('now')),
  ('bind_staple', 'shop_demo', 'A4', 'black_and_white', 'single_sided', 0, 'staple', 200, datetime('now'), datetime('now')),
  ('bind_spiral', 'shop_demo', 'A4', 'black_and_white', 'single_sided', 0, 'spiral', 3000, datetime('now'), datetime('now'));
