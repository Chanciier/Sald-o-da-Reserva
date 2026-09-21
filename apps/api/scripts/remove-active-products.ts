/**
 * Apaga (ou arquiva, se tiverem pedidos associados) todos os produtos com
 * status ACTIVE. Usado pra zerar o catálogo antes de uma reformulação do site.
 *
 * Segue exatamente a mesma regra do ProductsService.remove():
 *   - produto sem pedidos associados  -> apaga de vez (registro + imagens no S3)
 *   - produto com pedidos associados  -> arquiva (status ARCHIVED, stock 0),
 *     porque a FK de OrderItem é Restrict e apagar corromperia o histórico.
 *
 * Uso:
 *   npx ts-node scripts/remove-active-products.ts            # dry-run, só lista
 *   npx ts-node scripts/remove-active-products.ts --confirm  # executa de verdade
 *
 * Requer DATABASE_URL no ambiente (e AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/
 * AWS_BUCKET_NAME/AWS_ENDPOINT_URL se quiser apagar as imagens do S3 também;
 * sem eles a chamada ao S3 falha e o produto não é apagado).
 */
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

async function main() {
  const confirm = process.argv.includes('--confirm');

  const prisma = new PrismaService();
  await prisma.$connect();

  const config = new ConfigService();
  const storage = new StorageService(config, prisma);

  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    include: {
      images: { select: { key: true } },
      _count: { select: { orderItems: true } },
    },
  });

  if (!products.length) {
    console.log('Nenhum produto ACTIVE encontrado.');
    await prisma.$disconnect();
    return;
  }

  const toDelete = products.filter((p) => p._count.orderItems === 0);
  const toArchive = products.filter((p) => p._count.orderItems > 0);

  console.log(`Produtos ACTIVE encontrados: ${products.length}`);
  console.log(`  -> serão APAGADOS (sem pedidos): ${toDelete.length}`);
  console.log(
    `  -> serão ARQUIVADOS (têm pedidos, não podem ser apagados): ${toArchive.length}`,
  );

  if (!confirm) {
    console.log('\nDry-run — nada foi alterado. Rode com --confirm para executar de verdade.');
    await prisma.$disconnect();
    return;
  }

  for (const product of toArchive) {
    await prisma.product.update({
      where: { id: product.id },
      data: { status: 'ARCHIVED', stock: 0 },
    });
    await prisma.auditLog.create({
      data: {
        action: 'PRODUCT_ARCHIVED',
        metadata: { productId: product.id, name: product.name, reason: 'bulk-remove-active' },
      },
    });
  }

  for (const product of toDelete) {
    const keys = product.images.map((i) => i.key);
    if (keys.length) await storage.deleteManyByKeys(keys);
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.auditLog.create({
      data: {
        action: 'PRODUCT_DELETED',
        metadata: { productId: product.id, name: product.name, reason: 'bulk-remove-active' },
      },
    });
  }

  const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  const redis = new Redis(redisUrl);
  const cacheKeys = await redis.keys('products:*');
  if (cacheKeys.length) await redis.del(...cacheKeys);
  await redis.quit();

  console.log(`\nConcluído: ${toDelete.length} apagado(s), ${toArchive.length} arquivado(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
