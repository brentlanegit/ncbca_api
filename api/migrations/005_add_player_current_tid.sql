ALTER TABLE players
ADD COLUMN IF NOT EXISTS current_tid integer;

CREATE INDEX IF NOT EXISTS players_current_tid_idx ON players (current_tid);
