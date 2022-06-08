-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "beforeMigration" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "addedByUser" BOOLEAN NOT NULL DEFAULT false;
