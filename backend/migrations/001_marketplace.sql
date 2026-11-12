CREATE TABLE IF NOT EXISTS listing (
  id text PRIMARY KEY, seller_id text NOT NULL REFERENCES "user"(id),
  title text NOT NULL CHECK (length(title) BETWEEN 4 AND 100), description text NOT NULL,
  defects text NOT NULL, price_minor integer NOT NULL CHECK (price_minor >= 0),
  category_id text NOT NULL, condition text NOT NULL CHECK (condition IN ('like_new','good','fair','for_parts')),
  neighborhood text NOT NULL, negotiable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','sold','archived','removed')),
  images jsonb NOT NULL DEFAULT '[]', demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_feed_idx ON listing(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS listing_category_idx ON listing(category_id);
CREATE TABLE IF NOT EXISTS media (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id), path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS favorite (
  user_id text NOT NULL REFERENCES "user"(id), listing_id text NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS conversation (
  id text PRIMARY KEY, listing_id text NOT NULL REFERENCES listing(id), buyer_id text NOT NULL REFERENCES "user"(id),
  seller_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, buyer_id), CHECK (buyer_id <> seller_id)
);
CREATE TABLE IF NOT EXISTS message (
  id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES conversation(id), sender_id text NOT NULL REFERENCES "user"(id),
  client_id text NOT NULL, body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS message_thread ON message(conversation_id, created_at, id);
CREATE TABLE IF NOT EXISTS offer (
  id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES conversation(id), sender_id text NOT NULL REFERENCES "user"(id),
  amount_minor integer NOT NULL CHECK (amount_minor > 0), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meetup (
  id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES conversation(id), proposer_id text NOT NULL REFERENCES "user"(id),
  place text NOT NULL, scheduled_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS block (
  user_id text NOT NULL REFERENCES "user"(id), blocked_id text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, blocked_id), CHECK (user_id <> blocked_id)
);
CREATE TABLE IF NOT EXISTS report (
  id text PRIMARY KEY, reporter_id text NOT NULL REFERENCES "user"(id), listing_id text REFERENCES listing(id),
  reported_user_id text REFERENCES "user"(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(), resolved_by text REFERENCES "user"(id)
);
CREATE TABLE IF NOT EXISTS audit_event (
  id text PRIMARY KEY, actor_id text NOT NULL REFERENCES "user"(id), action text NOT NULL, target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
