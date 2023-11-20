/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "premium_expiry" TIMESTAMP(3),
ADD COLUMN     "premium_provider_user_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_premium_provider_user_id_fkey" FOREIGN KEY ("premium_provider_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
