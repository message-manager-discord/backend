/*
  Warnings:

  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReportMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReportReason` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_staffResolvedReasonId_fkey";

-- DropForeignKey
ALTER TABLE "ReportMessage" DROP CONSTRAINT "ReportMessage_reportId_fkey";

-- DropTable
DROP TABLE "Report";

-- DropTable
DROP TABLE "ReportMessage";

-- DropTable
DROP TABLE "ReportReason";

-- DropEnum
DROP TYPE "ReportStatus";
