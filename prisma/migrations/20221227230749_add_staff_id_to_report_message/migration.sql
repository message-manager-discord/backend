/*
  Warnings:

  - You are about to drop the column `fromStaff` on the `ReportMessage` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ReportMessage" DROP COLUMN "fromStaff",
ADD COLUMN     "staffId" BIGINT;

-- AlterTable
ALTER TABLE "StaffProfile" ALTER COLUMN "staffId" DROP NOT NULL;
