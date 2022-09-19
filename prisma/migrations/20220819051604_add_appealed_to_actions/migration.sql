-- AlterTable
ALTER TABLE "GuildBan" ADD COLUMN     "appealed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserBan" ADD COLUMN     "appealed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Warning" ADD COLUMN     "appealed" BOOLEAN NOT NULL DEFAULT false;
