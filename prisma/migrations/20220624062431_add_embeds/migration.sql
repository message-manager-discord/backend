-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "internalId" SERIAL NOT NULL,
ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("internalId");

-- CreateTable
CREATE TABLE "MessageEmbed" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "url" TEXT,
    "authorName" TEXT,
    "footerText" TEXT,
    "timestamp" TIMESTAMP(3),
    "color" INTEGER,
    "messageId" INTEGER NOT NULL,

    CONSTRAINT "MessageEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedField" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "inline" BOOLEAN NOT NULL DEFAULT false,
    "embedId" INTEGER NOT NULL,

    CONSTRAINT "EmbedField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageEmbed_messageId_key" ON "MessageEmbed"("messageId");

-- AddForeignKey
ALTER TABLE "MessageEmbed" ADD CONSTRAINT "MessageEmbed_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("internalId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmbedField" ADD CONSTRAINT "EmbedField_embedId_fkey" FOREIGN KEY ("embedId") REFERENCES "MessageEmbed"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
