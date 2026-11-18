-- Recovery and delivery fields are additive so an older coordinator can drain its matches.
ALTER TABLE online_rooms ADD COLUMN rating_void_reason text;
ALTER TABLE online_seats ADD COLUMN projection jsonb;
ALTER TABLE online_seats ADD COLUMN controller uuid;
ALTER TABLE online_seats ADD COLUMN generation int NOT NULL DEFAULT 0;
ALTER TABLE online_seats ADD COLUMN end_requested boolean NOT NULL DEFAULT false;
CREATE TABLE online_clock (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  last_tick timestamptz NOT NULL
);
ALTER TABLE online_seats ADD COLUMN accept_custom boolean NOT NULL DEFAULT false;
CREATE TABLE online_offers (
  id uuid PRIMARY KEY, player uuid REFERENCES online_players ON DELETE CASCADE,
  ticket uuid REFERENCES online_rooms, room uuid REFERENCES online_rooms,
  expires_at timestamptz NOT NULL, UNIQUE(ticket,player,room)
);
CREATE TABLE online_transfers (
  source uuid REFERENCES online_rooms, player uuid REFERENCES online_players,
  destination uuid REFERENCES online_rooms, PRIMARY KEY(source,player)
);

-- An account deletion cannot strand three players at an unlimited table.
CREATE FUNCTION online_release_deleted_seats() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE waiting_id uuid;
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    FOR waiting_id IN
      SELECT r.id FROM online_rooms r JOIN online_seats s ON s.room=r.id
      WHERE s.player=NEW.id AND r.state='waiting' ORDER BY r.id FOR UPDATE OF r
    LOOP
      DELETE FROM online_seats WHERE room=waiting_id AND player=NEW.id;
      UPDATE online_rooms SET host=(SELECT player FROM online_seats WHERE room=waiting_id AND player IS NOT NULL ORDER BY seat LIMIT 1) WHERE id=waiting_id AND host=NEW.id;
      UPDATE online_rooms SET state='closed',listed=false,invite=NULL WHERE id=waiting_id AND host IS NULL;
    END LOOP;
    UPDATE online_seats s SET covered=true,generation=generation+1 FROM online_rooms r
      WHERE r.id=s.room AND r.state='playing' AND s.player=NEW.id;
    UPDATE online_rooms r SET due_at=clock_timestamp() WHERE state='playing'
      AND EXISTS (SELECT 1 FROM online_seats s WHERE s.room=r.id AND s.player=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER online_release_deleted AFTER UPDATE OF user_id ON online_players
  FOR EACH ROW EXECUTE FUNCTION online_release_deleted_seats();
