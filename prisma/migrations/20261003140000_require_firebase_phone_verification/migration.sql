-- The removed phone flow had no SMS provider. Its phone reservations and
-- verification marks do not prove ownership. Release them so a legitimate
-- owner can attach their number after completing Firebase SMS verification.
UPDATE "User" SET "phone" = NULL, "phoneVerified" = NULL
WHERE "phone" IS NOT NULL OR "phoneVerified" IS NOT NULL;
