-- Tracks when a dynamic trove's name or items last changed, so clients (including the web
-- UI polling in the background) can detect edits made out-of-band, e.g. via the CLI, and
-- invalidate their own cached search results for that trove.
ALTER TABLE dynamic_troves ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
