-- AlterTable
ALTER TABLE "community_groups" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'geral';

-- AlterTable
ALTER TABLE "community_redirects" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'geral';

-- CreateIndex
CREATE INDEX "community_groups_category_idx" ON "community_groups"("category");

-- CreateIndex
CREATE INDEX "community_redirects_category_created_at_idx" ON "community_redirects"("category", "created_at");

