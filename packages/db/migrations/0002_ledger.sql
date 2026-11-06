CREATE FUNCTION validate_decision_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision > 1 AND NOT EXISTS (
    SELECT 1 FROM decisions
    WHERE tenant_id = NEW.tenant_id
      AND decision_id = NEW.decision_id
      AND revision = NEW.revision - 1
      AND digest = NEW.previous_digest
  ) THEN
    RAISE EXCEPTION 'Decision predecessor must be the previous revision of the same decision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decision_lineage BEFORE INSERT ON decisions
FOR EACH ROW EXECUTE FUNCTION validate_decision_lineage();