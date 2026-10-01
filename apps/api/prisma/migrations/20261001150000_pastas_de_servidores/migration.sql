-- CreateTable
CREATE TABLE "UserGuildLayout" (
    "userId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGuildLayout_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserGuildLayout" ADD CONSTRAINT "UserGuildLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
