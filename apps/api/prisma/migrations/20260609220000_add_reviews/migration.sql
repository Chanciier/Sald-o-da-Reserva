CREATE TABLE "reviews" (
  "id"         TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "rating"     INTEGER NOT NULL,
  "comment"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5),
  CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reviews_product_id_user_id_key" UNIQUE ("product_id", "user_id")
);

CREATE INDEX "reviews_product_id_idx" ON "reviews"("product_id");
