/*
  Warnings:

  - You are about to drop the column `action` on the `Report` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[actionId]` on the table `Report` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WarningType" AS ENUM ('warning', 'delete');

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "action",
ADD COLUMN     "actionId" BIGINT;

-- DropEnum
DROP TYPE "ReportAction";

-- CreateTable
CREATE TABLE "GuildBan" (
    "id" BIGSERIAL NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "expireAt" TIMESTAMP(3),
    "guildId" BIGINT NOT NULL,

    CONSTRAINT "GuildBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBan" (
    "id" BIGSERIAL NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "expireAt" TIMESTAMP(3),
    "userId" BIGINT NOT NULL,

    CONSTRAINT "UserBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" BIGSERIAL NOT NULL,
    "type" "WarningType" NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "guildId" BIGINT NOT NULL,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportActionLink" (
    "id" BIGSERIAL NOT NULL,
    "guildBanId" BIGINT,
    "userBanId" BIGINT,
    "warningId" BIGINT,

    CONSTRAINT "ReportActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportActionLink_guildBanId_key" ON "ReportActionLink"("guildBanId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportActionLink_userBanId_key" ON "ReportActionLink"("userBanId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportActionLink_warningId_key" ON "ReportActionLink"("warningId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_actionId_key" ON "Report"("actionId");

-- AddForeignKey
ALTER TABLE "GuildBan" ADD CONSTRAINT "GuildBan_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserBan" ADD CONSTRAINT "UserBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReportActionLink" ADD CONSTRAINT "ReportActionLink_guildBanId_fkey" FOREIGN KEY ("guildBanId") REFERENCES "GuildBan"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReportActionLink" ADD CONSTRAINT "ReportActionLink_userBanId_fkey" FOREIGN KEY ("userBanId") REFERENCES "UserBan"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReportActionLink" ADD CONSTRAINT "ReportActionLink_warningId_fkey" FOREIGN KEY ("warningId") REFERENCES "Warning"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ReportActionLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
