-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('Pending', 'Open', 'Actioned', 'Ignored', 'Spam');

-- CreateTable
CREATE TABLE "Report" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT E'Pending',
    "userReportReason" TEXT NOT NULL,
    "staffResolvedReasonId" BIGINT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportReason" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ReportReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" BIGINT NOT NULL,
    "authorId" BIGINT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "reportId" BIGINT NOT NULL,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_userId_messageId_guildId_key" ON "Report"("userId", "messageId", "guildId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_staffResolvedReasonId_fkey" FOREIGN KEY ("staffResolvedReasonId") REFERENCES "ReportReason"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
