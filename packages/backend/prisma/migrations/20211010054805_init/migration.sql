-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('SUCCESS', 'MISSING_BOT_PERMISSIONS', 'MISSING_USER_PERMISSIONS', 'INVALID_INPUT', 'MISSING_BOT_SCOPE', 'GUILD_ONLY_COMMAND_IN_DM', 'CHANNEL_INPUT_NOT_TEXT_CHANNEL', 'UNKNOWN_ERROR', 'INPUT_CHANNEL_NOT_FOUND', 'TIMEOUT', 'INPUT_DIFFERENT_SERVER', 'CONFIG_NOT_SET', 'MESSAGE_AUTHOR_NOT_BOT', 'INPUT_JSON_INVALID', 'INPUT_TOO_LONG', 'USER_CANCELLED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" BIGINT NOT NULL,
    "webhookId" BIGINT,
    "webhookToken" VARCHAR(255),

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandUsageAnalytics" (
    "id" SERIAL NOT NULL,
    "guildId" BIGINT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commandName" JSONB NOT NULL,
    "slash" BOOLEAN NOT NULL,
    "success" "CommandStatus" NOT NULL DEFAULT E'SUCCESS',

    CONSTRAINT "CommandUsageAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" BIGINT NOT NULL,
    "managementRoleId" BIGINT,
    "prefix" VARCHAR(3) DEFAULT E'~',

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggingChannel" (
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "loggerType" VARCHAR(20) NOT NULL,
    "id" SERIAL NOT NULL,

    CONSTRAINT "LoggingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uid_logging_cha_guild_i_b7be0e" ON "LoggingChannel"("guildId", "channelId");

-- AddForeignKey
ALTER TABLE "LoggingChannel" ADD CONSTRAINT "LoggingChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoggingChannel" ADD CONSTRAINT "LoggingChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
