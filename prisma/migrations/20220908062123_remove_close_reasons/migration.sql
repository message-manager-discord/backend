/*
  Warnings:

  - You are about to drop the column `closeReason` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `closeStaffReason` on the `Report` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Report" DROP COLUMN "closeReason",
DROP COLUMN "closeStaffReason";
