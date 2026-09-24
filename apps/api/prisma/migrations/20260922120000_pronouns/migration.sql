-- A profile shows he/him, she/her, or no pronouns. Anything else is cleared, then ruled out.
UPDATE "User" SET "pronouns" = NULL WHERE "pronouns" NOT IN ('he/him', 'she/her');
ALTER TABLE "User" ADD CONSTRAINT "User_pronouns_check" CHECK ("pronouns" IN ('he/him', 'she/her'));
