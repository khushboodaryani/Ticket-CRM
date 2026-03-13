-- Add metadata column to conversations table for omnichannel support
ALTER TABLE conversations ADD COLUMN metadata JSON DEFAULT NULL;
