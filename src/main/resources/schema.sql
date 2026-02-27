-- PostgreSQL schema for auth: users (form login) and API tokens (hashed, tied to user).
-- Run this yourself; no Flyway. Passwords and tokens must be stored hashed.
--
-- Example: insert a user (use a BCrypt hash of the desired password):
--   INSERT INTO users (username, password_hash, enabled)
--   VALUES ('admin', '<BCrypt hash of password>', true);

CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  username   VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS api_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  name       VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens (user_id);
