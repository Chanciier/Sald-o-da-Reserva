import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Admin@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'adriansanluz@gmail.com' },
    update: { passwordHash, role: Role.ADMIN },
    create: {
      name: 'Adrian',
      email: 'adriansanluz@gmail.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log('✓ Admin criado:', admin.email);

  const categories = [
    {
      name: 'Eletrônicos',
      slug: 'eletronicos',
      description: 'Smartphones, tablets, computadores e acessórios',
    },
    { name: 'Roupas', slug: 'roupas', description: 'Vestuário masculino e feminino' },
    { name: 'Calçados', slug: 'calcados', description: 'Sapatos, tênis e sandálias' },
    { name: 'Casa e Cozinha', slug: 'casa-cozinha', description: 'Utensílios e decoração' },
    { name: 'Esportes', slug: 'esportes', description: 'Artigos esportivos e fitness' },
    { name: 'Livros', slug: 'livros', description: 'Livros físicos e digitais' },
    { name: 'Brinquedos', slug: 'brinquedos', description: 'Brinquedos e jogos' },
    { name: 'Beleza', slug: 'beleza', description: 'Cosméticos e cuidados pessoais' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log(`✓ ${categories.length} categorias criadas`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
