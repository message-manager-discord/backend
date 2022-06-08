/*
  Warnings:

  - Added the required column `oldContent` to the `MessageHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MessageHistory" ADD COLUMN     "oldContent" TEXT NOT NULL;
