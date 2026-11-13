
ALTER TABLE listing ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}';
ALTER TABLE listing ADD COLUMN subcategory text;
ALTER TABLE listing ADD COLUMN latitude double precision;
ALTER TABLE listing ADD COLUMN longitude double precision;
ALTER TABLE listing ADD CONSTRAINT listing_coordinates CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN 8.80 AND 9.15 AND longitude BETWEEN 38.60 AND 39.00));
ALTER TABLE offer DROP CONSTRAINT offer_status_check;
ALTER TABLE offer ADD CONSTRAINT offer_status_check CHECK(status IN ('pending','accepted','declined','withdrawn','expired','countered'));
ALTER TABLE offer ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days';
ALTER TABLE offer ADD COLUMN previous_id text REFERENCES offer(id);
ALTER TABLE meetup DROP CONSTRAINT meetup_status_check;
ALTER TABLE meetup ADD CONSTRAINT meetup_status_check CHECK(status IN ('proposed','confirmed','cancelled','completed','no_show_reported'));
ALTER TABLE meetup ADD COLUMN neighborhood text;
ALTER TABLE meetup ADD COLUMN previous_id text REFERENCES meetup(id);
CREATE TABLE reservation (
 id text PRIMARY KEY, listing_id text NOT NULL REFERENCES listing(id), conversation_id text NOT NULL REFERENCES conversation(id),
 buyer_id text NOT NULL REFERENCES "user"(id), seller_id text NOT NULL REFERENCES "user"(id),
 expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','expired','cancelled','completed')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(buyer_id<>seller_id)
);
CREATE UNIQUE INDEX reservation_exclusive ON reservation(listing_id) WHERE status='confirmed';
CREATE INDEX reservation_expiry ON reservation(expires_at) WHERE status='confirmed';
CREATE TABLE sale (
 id text PRIMARY KEY, listing_id text NOT NULL UNIQUE REFERENCES listing(id), seller_id text NOT NULL REFERENCES "user"(id),
 buyer_id text REFERENCES "user"(id), conversation_id text REFERENCES conversation(id),
 seller_confirmed boolean NOT NULL DEFAULT true, buyer_confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(buyer_id IS NULL OR buyer_id<>seller_id)
);
CREATE TABLE review (
 id text PRIMARY KEY, sale_id text NOT NULL REFERENCES sale(id), author_id text NOT NULL REFERENCES "user"(id),
 subject_id text NOT NULL REFERENCES "user"(id), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body text NOT NULL CHECK(length(body)<=1000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sale_id,author_id), CHECK(author_id<>subject_id)
);
CREATE INDEX review_subject ON review(subject_id,created_at DESC);
CREATE TABLE user_settings (
 user_id text PRIMARY KEY REFERENCES "user"(id), locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','am','om')),
 push_enabled boolean NOT NULL DEFAULT true, suspended boolean NOT NULL DEFAULT false,
 suspension_reason text, deletion_requested_at timestamptz
);
CREATE TABLE conversation_read (
 conversation_id text NOT NULL REFERENCES conversation(id), user_id text NOT NULL REFERENCES "user"(id),
 message_id text NOT NULL REFERENCES message(id), read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE conversation_mute (
 conversation_id text NOT NULL REFERENCES conversation(id), user_id text NOT NULL REFERENCES "user"(id), PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE push_device (
 token text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_job (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), actor_id text REFERENCES "user"(id),
 conversation_id text REFERENCES conversation(id), kind text NOT NULL, resource_id text NOT NULL,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','suppressed','failed')),
 locked_at timestamptz, lease text, receipts_checked boolean NOT NULL DEFAULT false, receipt_ids jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,kind,resource_id)
);
CREATE INDEX notification_pending ON notification_job(available_at) WHERE status IN ('pending','processing');
CREATE TABLE saved_search (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), name text NOT NULL, filters jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_request (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), kind text NOT NULL CHECK(kind IN ('recovery','appeal','deletion','support')),
 body text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 response text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE listing_status_history (
 id bigserial PRIMARY KEY, listing_id text NOT NULL REFERENCES listing(id), actor_id text REFERENCES "user"(id),
 previous_status text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing ADD COLUMN client_id text;
CREATE UNIQUE INDEX listing_publish_idempotency ON listing(seller_id,client_id) WHERE client_id IS NOT NULL;

ALTER TABLE listing ADD COLUMN publication_status text NOT NULL DEFAULT 'published' CHECK(publication_status IN ('published','archived'));
ALTER TABLE listing ADD COLUMN moderation_status text NOT NULL DEFAULT 'clear' CHECK(moderation_status IN ('clear','removed'));
ALTER TABLE listing ADD COLUMN availability text NOT NULL DEFAULT 'available' CHECK(availability IN ('available','reserved','sold'));
UPDATE listing SET publication_status=CASE WHEN status='archived' THEN 'archived' ELSE 'published' END,
 moderation_status=CASE WHEN status='removed' THEN 'removed' ELSE 'clear' END,
 availability=CASE WHEN status='sold' THEN 'sold' WHEN status='reserved' THEN 'reserved' ELSE 'available' END;
CREATE FUNCTION synchronize_listing_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='removed' THEN NEW.moderation_status='removed';
  ELSIF NEW.status='archived' THEN NEW.publication_status='archived';IF NEW.availability='reserved' THEN NEW.availability='available';END IF;
  ELSIF NEW.status='sold' THEN NEW.availability='sold';
  ELSIF NEW.status='reserved' THEN NEW.availability='reserved';NEW.publication_status='published';
  ELSE NEW.publication_status='published';NEW.availability='available';END IF;
 END IF;
 NEW.status=CASE WHEN NEW.moderation_status='removed' THEN 'removed' WHEN NEW.publication_status='archived' THEN 'archived' WHEN NEW.availability='sold' THEN 'sold' WHEN NEW.availability='reserved' THEN 'reserved' ELSE 'active' END;
 RETURN NEW;
END $$;
CREATE TRIGGER listing_state BEFORE INSERT OR UPDATE ON listing FOR EACH ROW EXECUTE FUNCTION synchronize_listing_status();
ALTER TABLE user_settings ADD COLUMN erased_at timestamptz;
CREATE TABLE media_cleanup (id text PRIMARY KEY,storage jsonb NOT NULL,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX listing_search_trigram ON listing USING gin (lower(title || ' ' || description) gin_trgm_ops);

ALTER TABLE media ADD COLUMN thumbnail_storage jsonb;
ALTER TABLE media ADD COLUMN thumbnail_path text;
ALTER TABLE notification_job ADD COLUMN successful_tokens jsonb NOT NULL DEFAULT '[]';

CREATE TABLE admin_grant(session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,user_id text NOT NULL REFERENCES "user"(id),expires_at timestamptz NOT NULL);
CREATE TABLE admin_totp_state(user_id text PRIMARY KEY REFERENCES "user"(id),last_counter bigint,attempts integer NOT NULL DEFAULT 0,window_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE listing ADD COLUMN publish_hash text;

ALTER TABLE media ADD COLUMN upload_client_id text;
ALTER TABLE media ADD COLUMN upload_hash text;
CREATE UNIQUE INDEX media_upload_idempotency ON media(owner_id,upload_client_id) WHERE upload_client_id IS NOT NULL;

ALTER TABLE report ADD COLUMN message_id text REFERENCES message(id);
ALTER TABLE report ADD COLUMN review_id text REFERENCES review(id);

ALTER TABLE review ADD COLUMN hidden boolean NOT NULL DEFAULT false;

ALTER TABLE audit_event ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';

CREATE INDEX listing_area_filter ON listing(neighborhood,status,price_minor,created_at DESC,id);
CREATE INDEX listing_price_sort ON listing(status,price_minor,id);
CREATE INDEX listing_seller_history ON listing(seller_id,created_at DESC,id);
CREATE INDEX listing_image_references ON listing USING gin(images);
CREATE INDEX offer_expiry ON offer(expires_at) WHERE status='pending';
CREATE INDEX media_orphan_age ON media(created_at);
