/*
  Warnings:

  - You are about to drop the column `managementRoleIds` on the `Guild` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Guild" DROP COLUMN "managementRoleIds";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "tags";
