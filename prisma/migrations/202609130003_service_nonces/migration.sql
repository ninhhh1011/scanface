CREATE TABLE service_nonces (nonce TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX service_nonces_expiry ON service_nonces(expires_at);
