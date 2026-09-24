-- AlterTable
ALTER TABLE "GuildMember" ADD COLUMN     "voiceDeafened" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceMuted" BOOLEAN NOT NULL DEFAULT false;

