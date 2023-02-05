-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('Pending', 'Assigned', 'Warning', 'Review', 'Spam', 'Actioned', 'Invalid');

-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('GuildBan', 'UserBan', 'Warning', 'Delete');

-- CreateTable
CREATE TABLE "Report" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT E'Pending',
    "action" "ReportAction"[],
    "reason" TEXT NOT NULL,
    "reportingUserId" BIGINT NOT NULL,
    "assignedStaffId" BIGINT,
    "guildId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportedMessageId" BIGINT NOT NULL,
    "reportedMessageSnapshotInternalId" INTEGER NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" BIGSERIAL NOT NULL,
    "authorId" BIGINT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL,
    "staffOnly" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "reportId" BIGINT NOT NULL,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedMessageSnapshotInternalId_fkey" FOREIGN KEY ("reportedMessageSnapshotInternalId") REFERENCES "Message"("internalId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
