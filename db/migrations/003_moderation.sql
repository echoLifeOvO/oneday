-- Legacy rows retain NULL audit fields; every new application write supplies approval.
ALTER TABLE diaries
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderation_model text,
  ADD COLUMN moderation_policy text,
  ADD CONSTRAINT diaries_moderation_check CHECK (
    (moderated_at IS NULL AND moderation_model IS NULL AND moderation_policy IS NULL) OR
    (moderated_at IS NOT NULL AND moderation_model IS NOT NULL AND moderation_policy IS NOT NULL
      AND char_length(moderation_model) BETWEEN 1 AND 100 AND char_length(moderation_policy) BETWEEN 1 AND 100));
ALTER TABLE comments
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderation_model text,
  ADD COLUMN moderation_policy text,
  ADD CONSTRAINT comments_moderation_check CHECK (
    (moderated_at IS NULL AND moderation_model IS NULL AND moderation_policy IS NULL) OR
    (moderated_at IS NOT NULL AND moderation_model IS NOT NULL AND moderation_policy IS NOT NULL
      AND char_length(moderation_model) BETWEEN 1 AND 100 AND char_length(moderation_policy) BETWEEN 1 AND 100));
