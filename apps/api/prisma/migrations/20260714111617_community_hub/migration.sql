-- CreateEnum
CREATE TYPE "CommunityGroupStatus" AS ENUM ('ACTIVE', 'FULL', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommunityRedirectOutcome" AS ENUM ('REDIRECTED', 'ALL_FULL');

-- CreateTable
CREATE TABLE "community_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_jid" TEXT,
    "invite_link" TEXT NOT NULL,
    "status" "CommunityGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacity" INTEGER NOT NULL DEFAULT 1024,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_redirects" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "outcome" "CommunityRedirectOutcome" NOT NULL,
    "visitor_id" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_group_snapshots" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_group_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_groups_group_jid_key" ON "community_groups"("group_jid");

-- CreateIndex
CREATE INDEX "community_groups_active_status_idx" ON "community_groups"("active", "status");

-- CreateIndex
CREATE INDEX "community_redirects_created_at_idx" ON "community_redirects"("created_at");

-- CreateIndex
CREATE INDEX "community_redirects_group_id_created_at_idx" ON "community_redirects"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "community_group_snapshots_group_id_captured_at_idx" ON "community_group_snapshots"("group_id", "captured_at");

-- AddForeignKey
ALTER TABLE "community_redirects" ADD CONSTRAINT "community_redirects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_group_snapshots" ADD CONSTRAINT "community_group_snapshots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
