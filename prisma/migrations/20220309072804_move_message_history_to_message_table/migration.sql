/*
  Warnings:

  - You are about to drop the column `lastEditedAt` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `lastEditedBy` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `MessageHistory` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[id,editedAt]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `editedAt` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `editedBy` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Message_id_key";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "lastEditedAt",
DROP COLUMN "lastEditedBy",
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "editedBy" BIGINT NOT NULL;

-- DropTable
DROP TABLE "MessageHistory";

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_editedAt_key" ON "Message"("id", "editedAt");
