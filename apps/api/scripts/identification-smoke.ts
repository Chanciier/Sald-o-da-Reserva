/**
 * Smoke-test REAL do IdentificationModule contra um Ollama de verdade.
 *
 * Encadeia Vision → Identification, exatamente como o painel de revisão faz.
 * Requer Ollama rodando (ver scripts/vision-smoke.ts para pré-requisitos) e o
 * banco configurado (para o match de categoria via Prisma).
 *
 * Uso:
 *   npx ts-node scripts/identification-smoke.ts <url-ou-caminho-da-imagem>
 */
import { readFileSync } from 'fs';
import { IdentificationService } from '../src/identification/identification.service';
import { OllamaService } from '../src/ollama/ollama.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VisionService } from '../src/vision/vision.service';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: ts-node scripts/identification-smoke.ts <url-ou-caminho-da-imagem>');
    process.exit(1);
  }

  const ollama = new OllamaService();
  const vision = new VisionService(ollama);
  const prisma = new PrismaService();
  const identification = new IdentificationService(ollama, prisma);

  const isUrl = /^https?:\/\//i.test(arg);
  const input = isUrl
    ? { imageUrls: [arg] }
    : { imagesBase64: [readFileSync(arg).toString('base64')] };

  await prisma.$connect();
  try {
    console.log('1/2 — Vision: extraindo atributos...');
    const visionResult = await vision.analyze(input);
    console.log(JSON.stringify(visionResult, null, 2));

    console.log('\n2/2 — Identification: gerando conteúdo comercial...');
    const identificationResult = await identification.generate(visionResult);
    console.log(JSON.stringify(identificationResult, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Falha:', err?.message ?? err);
  process.exit(1);
});
