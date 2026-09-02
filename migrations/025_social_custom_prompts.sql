ALTER TABLE dental_portal.social_brand_settings
  ADD COLUMN caption_prompt text NOT NULL DEFAULT '' CHECK (length(caption_prompt) <= 3000),
  ADD COLUMN image_prompt text NOT NULL DEFAULT '' CHECK (length(image_prompt) <= 3000);
