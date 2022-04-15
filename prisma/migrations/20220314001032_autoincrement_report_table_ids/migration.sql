-- AlterTable
CREATE SEQUENCE "report_id_seq";
ALTER TABLE "Report" ALTER COLUMN "id" SET DEFAULT nextval('report_id_seq');
ALTER SEQUENCE "report_id_seq" OWNED BY "Report"."id";

-- AlterTable
CREATE SEQUENCE "reportmessage_id_seq";
ALTER TABLE "ReportMessage" ALTER COLUMN "id" SET DEFAULT nextval('reportmessage_id_seq');
ALTER SEQUENCE "reportmessage_id_seq" OWNED BY "ReportMessage"."id";

-- AlterTable
CREATE SEQUENCE "reportreason_id_seq";
ALTER TABLE "ReportReason" ALTER COLUMN "id" SET DEFAULT nextval('reportreason_id_seq');
ALTER SEQUENCE "reportreason_id_seq" OWNED BY "ReportReason"."id";
