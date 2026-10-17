-- UTC-day allowances are global across formats. Scores accumulate by year and format.
CREATE TABLE IF NOT EXISTS hype_wallets (
  day TEXT NOT NULL,
  voter TEXT NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0 CHECK (spent BETWEEN 0 AND 10),
  PRIMARY KEY (day, voter)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hype_titles (
  year INTEGER NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('Anime','Donghua','Manga','Manhwa','Manhua')),
  anilist_id INTEGER NOT NULL CHECK (anilist_id > 0),
  item_json TEXT NOT NULL,
  popularity INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  PRIMARY KEY (year, format, anilist_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS hype_ranking ON hype_titles (year, format, points DESC, popularity DESC, anilist_id);
CREATE INDEX IF NOT EXISTS hype_mal_identity ON hype_titles (year, format, json_extract(item_json, '$.malId'));
CREATE TABLE IF NOT EXISTS hype_budgets (
  day TEXT NOT NULL,
  bucket TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hype_votes (
  day TEXT NOT NULL,
  voter TEXT NOT NULL,
  request_id TEXT NOT NULL,
  requested_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  format TEXT NOT NULL,
  anilist_id INTEGER NOT NULL,
  ip_bucket TEXT NOT NULL,
  daily_cap INTEGER NOT NULL CHECK (daily_cap BETWEEN 1 AND 5000),
  PRIMARY KEY (day, voter, request_id),
  FOREIGN KEY (day, voter) REFERENCES hype_wallets(day, voter),
  FOREIGN KEY (year, format, anilist_id) REFERENCES hype_titles(year, format, anilist_id)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS hype_vote_guard BEFORE INSERT ON hype_votes
WHEN NOT EXISTS (SELECT 1 FROM hype_votes WHERE day = NEW.day AND voter = NEW.voter AND request_id = NEW.request_id)
BEGIN
  SELECT CASE WHEN (SELECT spent FROM hype_wallets WHERE day = NEW.day AND voter = NEW.voter) >= 10
    THEN RAISE(ABORT, 'HYPE_EXHAUSTED') END;
  SELECT CASE WHEN COALESCE((SELECT used FROM hype_budgets WHERE day = NEW.day AND bucket = NEW.ip_bucket), 0) >= 100
    OR COALESCE((SELECT used FROM hype_budgets WHERE day = NEW.day AND bucket = 'global'), 0) >= NEW.daily_cap
    THEN RAISE(ABORT, 'HYPE_PAUSED') END;
END;
CREATE TRIGGER IF NOT EXISTS hype_vote_count AFTER INSERT ON hype_votes
BEGIN
  UPDATE hype_wallets SET spent = spent + 1 WHERE day = NEW.day AND voter = NEW.voter;
  UPDATE hype_titles SET points = points + 1 WHERE year = NEW.year AND format = NEW.format AND anilist_id = NEW.anilist_id;
  INSERT INTO hype_budgets(day, bucket, used) VALUES (NEW.day, NEW.ip_bucket, 1)
    ON CONFLICT(day, bucket) DO UPDATE SET used = used + 1;
  INSERT INTO hype_budgets(day, bucket, used) VALUES (NEW.day, 'global', 1)
    ON CONFLICT(day, bucket) DO UPDATE SET used = used + 1;
END;
