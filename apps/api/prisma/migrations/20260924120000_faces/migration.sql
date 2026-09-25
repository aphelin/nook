-- A face a member picked: a shape by name and one of three face colours. Both or neither.
ALTER TABLE "User" ADD COLUMN "faceShape" TEXT, ADD COLUMN "faceTone" SMALLINT;
ALTER TABLE "User" ADD CONSTRAINT "User_face_check" CHECK (("faceShape" IS NULL) = ("faceTone" IS NULL) AND ("faceTone" IS NULL OR "faceTone" BETWEEN 1 AND 3));
