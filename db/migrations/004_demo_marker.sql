-- Explicitly labelled fixtures for the owner's mobile tests, never inferred
-- from a nickname or mixed up with an AI moderation receipt.
ALTER TABLE diaries ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
