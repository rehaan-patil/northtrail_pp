CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  owner text NOT NULL CHECK (owner ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner)
);

CREATE TABLE intents (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  intent_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, intent_id, revision)
);

CREATE TABLE decisions (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  decision_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  digest text NOT NULL CHECK (digest ~ '^0x[0-9a-f]{64}$'),
  previous_digest text,
  idempotency_key text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, decision_id, revision),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, digest),
  FOREIGN KEY (tenant_id, previous_digest) REFERENCES decisions(tenant_id, digest),
  CHECK ((revision = 1 AND previous_digest IS NULL) OR (revision > 1 AND previous_digest IS NOT NULL))
);

CREATE TABLE attempts (
  tenant_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  intent_revision integer NOT NULL,
  decision_digest text,
  state text NOT NULL CHECK (state IN ('DRAFT','QUOTED','REVIEWED','SIGNED','SUBMITTED','PENDING','CONFIRMED','REVERTED','REORGED','UNKNOWN_FINALITY','REPLACED','EXPIRED','CANCELLED')),
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  quote_digest text,
  auth_digest text,
  tx_hash text CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, attempt_id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (chain_id, tx_hash),
  FOREIGN KEY (tenant_id, intent_id, intent_revision) REFERENCES intents(tenant_id, intent_id, revision),
  FOREIGN KEY (tenant_id, decision_digest) REFERENCES decisions(tenant_id, digest)
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('RECONCILE')),
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','LEASED','DONE','FAILED')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  tries integer NOT NULL DEFAULT 0 CHECK (tries >= 0),
  UNIQUE (tenant_id, attempt_id, kind),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES attempts(tenant_id, attempt_id)
);
CREATE INDEX outbox_ready ON outbox(state, available_at);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,
  object_id uuid NOT NULL,
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence is append-only';
END;
$$;
CREATE TRIGGER immutable_decisions BEFORE UPDATE OR DELETE ON decisions FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();
CREATE TRIGGER immutable_intents BEFORE UPDATE OR DELETE ON intents FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();