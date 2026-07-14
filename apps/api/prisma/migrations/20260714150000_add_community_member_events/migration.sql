-- CreateEnum
CREATE TYPE "CommunityMemberEventType" AS ENUM ('JOIN', 'LEAVE');

-- CreateEnum
CREATE TYPE "CommunityMemberEventSource" AS ENUM ('REALTIME', 'SYNC_INFERRED');

-- CreateTable
CREATE TABLE "community_member_events" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "type" "CommunityMemberEventType" NOT NULL,
    "source" "CommunityMemberEventSource" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_member_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "community_member_events_count_check" CHECK ("count" > 0)
);

-- CreateIndex
CREATE INDEX "community_member_events_created_at_idx" ON "community_member_events"("created_at");

-- CreateIndex
CREATE INDEX "community_member_events_group_id_created_at_idx" ON "community_member_events"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "community_member_events_type_created_at_idx" ON "community_member_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "community_member_events" ADD CONSTRAINT "community_member_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
