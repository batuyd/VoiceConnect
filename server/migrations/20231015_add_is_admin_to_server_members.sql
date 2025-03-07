ALTER TABLE server_members
ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE server_invites
ADD COLUMN receiver_id INTEGER;
