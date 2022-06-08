/*
  Warnings:

  - You are about to drop the column `managementRoleId` on the `Guild` table. All the data in the column will be lost.
  - You are about to drop the column `prefix` on the `Guild` table. All the data in the column will be lost.
  - You are about to drop the `CommandUsageAnalytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LoggingChannel` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `guildId` to the `Channel` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "LoggingChannel" DROP CONSTRAINT "LoggingChannel_channelId_fkey";

-- DropForeignKey
ALTER TABLE "LoggingChannel" DROP CONSTRAINT "LoggingChannel_guildId_fkey";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "guildId" BIGINT NOT NULL,
ADD COLUMN     "permissions" JSONB;

-- AlterTable
ALTER TABLE "Guild" DROP COLUMN "managementRoleId",
DROP COLUMN "prefix",
ADD COLUMN     "logChannelId" BIGINT,
ADD COLUMN     "permissions" JSONB;

-- DropTable
DROP TABLE "CommandUsageAnalytics";

-- DropTable
DROP TABLE "LoggingChannel";

-- DropEnum
DROP TYPE "CommandStatus";

-- CreateTable
CREATE TABLE "Message" (
    "id" BIGINT NOT NULL,
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "lastEditedAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[]
);

-- CreateTable
CREATE TABLE "MessageHistory" (
    "id" BIGINT NOT NULL,
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "newContent" TEXT NOT NULL,
    "editedBy" BIGINT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[]
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_key" ON "Message"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MessageHistory_id_editedAt_key" ON "MessageHistory"("id", "editedAt");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
