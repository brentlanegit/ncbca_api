ALTER TABLE players
ADD COLUMN IF NOT EXISTS weight_lbs integer;

ALTER TABLE players
ADD COLUMN IF NOT EXISTS college text;