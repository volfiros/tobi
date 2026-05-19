CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_id
ON messages(provider_message_id)
WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
ON payments(provider_payment_id)
WHERE provider_payment_id IS NOT NULL;
