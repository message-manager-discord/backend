/*
  Warnings:

  - The values [GuildBan,UserBan,Warning,Delete] on the enum `ReportAction` will be removed. If these variants are still used in the database, this will fail.
  - The values [Pending,Assigned,Warning,Review,Spam,Actioned,Invalid] on the enum `ReportStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReportAction_new" AS ENUM ('guild_ban', 'user_ban', 'warning', 'delete');
ALTER TABLE "Report" ALTER COLUMN "action" TYPE "ReportAction_new"[] USING ("action"::text::"ReportAction_new"[]);
ALTER TYPE "ReportAction" RENAME TO "ReportAction_old";
ALTER TYPE "ReportAction_new" RENAME TO "ReportAction";
DROP TYPE "ReportAction_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ReportStatus_new" AS ENUM ('pending', 'assigned', 'warning', 'review', 'spam', 'actioned', 'invalid');
ALTER TABLE "Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report" ALTER COLUMN "status" TYPE "ReportStatus_new" USING ("status"::text::"ReportStatus_new");
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_old";
ALTER TYPE "ReportStatus_new" RENAME TO "ReportStatus";
DROP TYPE "ReportStatus_old";
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT E'pending';
