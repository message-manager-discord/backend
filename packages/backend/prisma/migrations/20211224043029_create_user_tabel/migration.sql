-- CreateTable
CREATE TABLE "User" (
    "id" BIGINT NOT NULL,
    "oauthToken" TEXT,
    "oauthTokenExpiration" TIMESTAMP(3),
    "refreshToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
