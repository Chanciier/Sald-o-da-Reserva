-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "package_height" INTEGER,
ADD COLUMN     "package_width" INTEGER,
ADD COLUMN     "package_length" INTEGER,
ADD COLUMN     "package_weight" DECIMAL(8,3);
