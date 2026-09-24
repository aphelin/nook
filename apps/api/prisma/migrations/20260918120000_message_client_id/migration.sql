-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientId" UUID;
-- CreateIndex
CREATE UNIQUE INDEX "Message_authorId_clientId_key" ON "Message"("authorId", "clientId");
