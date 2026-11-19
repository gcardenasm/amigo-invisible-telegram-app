ALTER TABLE rooms ADD COLUMN linked_group_id INTEGER;
ALTER TABLE rooms ADD COLUMN linked_group_title TEXT NOT NULL DEFAULT '';
