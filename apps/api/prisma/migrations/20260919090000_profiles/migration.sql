-- Avatars are stored privately and served through the api, so the row keeps the storage key, not a URL.
ALTER TABLE "User" RENAME COLUMN "avatarUrl" TO "avatarKey";
UPDATE "User" SET "avatarKey" = NULL;

-- Custom statuses can clear themselves.
ALTER TABLE "User" ADD COLUMN "statusExpiresAt" TIMESTAMP(3);
