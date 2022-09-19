/*
  Warnings:

  - You are about to drop the column `userBanId` on the `ReportActionLink` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ReportActionLink" DROP CONSTRAINT "ReportActionLink_userBanId_fkey";

-- DropIndex
DROP INDEX "ReportActionLink_userBanId_key";

-- AlterTable
ALTER TABLE "ReportActionLink" DROP COLUMN "userBanId";

-- AlterTable
ALTER TABLE "UserBan" ADD COLUMN     "reportActionLinkId" BIGINT;

-- AddForeignKey
ALTER TABLE "UserBan" ADD CONSTRAINT "UserBan_reportActionLinkId_fkey" FOREIGN KEY ("reportActionLinkId") REFERENCES "ReportActionLink"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
