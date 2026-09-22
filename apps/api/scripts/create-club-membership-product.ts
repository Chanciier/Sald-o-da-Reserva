/**
 * Cria o produto "Clube Reversa" — não é um produto físico: comprá-lo
 * registra o cliente como sócio do clube (ClubMembershipModule ouve
 * OmsEvents.OrderPaid e chama o intermediador quando esse produto está no
 * pedido). Stock alto (nunca 0) porque checkout.service.ts rejeita a compra
 * se stock < quantidade, e StockService desativa o produto se o estoque
 * chegar a 0 — nenhum dos dois faz sentido pra um "produto" sem limite real.
 *
 * Idempotente: se o produto já existir (pelo slug), só atualiza os campos
 * relevantes em vez de duplicar.
 *
 * Uso: npx ts-node scripts/create-club-membership-product.ts
 * Requer DATABASE_URL no ambiente.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { slugify } from '../src/utils/slugify';

const NAME = 'Clube Reversa';
const SLUG = slugify(NAME);
const SKU = 'CLUBE-REVERSA';
const PRICE = 120.0;
const STOCK = 999999;

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const existing = await prisma.product.findUnique({ where: { slug: SLUG } });

  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: NAME,
        price: PRICE,
        stock: STOCK,
        isUnique: false,
        isClubMembership: true,
        status: 'ACTIVE',
        pickupAvailable: true,
      },
    });
    console.log(`Produto "${NAME}" já existia (id=${existing.id}) — atualizado.`);
  } else {
    const product = await prisma.product.create({
      data: {
        name: NAME,
        slug: SLUG,
        sku: SKU,
        shortDescription: 'Assine o Clube Reversa e aproveite benefícios exclusivos de sócio.',
        description:
          'Ao assinar o Clube Reversa você se torna sócio ativo, com benefícios exclusivos. ' +
          'A ativação é feita automaticamente após a confirmação do pagamento.',
        price: PRICE,
        stock: STOCK,
        isUnique: false,
        isClubMembership: true,
        status: 'ACTIVE',
        pickupAvailable: true,
        condition: 'new',
      },
    });
    console.log(`Produto "${NAME}" criado (id=${product.id}, slug=${product.slug}).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
