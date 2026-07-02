/**
 * Smoke-test REAL do IdentificationModule contra a API da Anthropic de verdade.
 *
 * Encadeia Vision → Identification, exatamente como o painel de revisão faz.
 * Requer ANTHROPIC_API_KEY válida e o banco configurado (para o match de
 * categoria via Prisma).
 *
 * Uso:
 *   npx ts-node scripts/identification-smoke.ts <url-ou-caminho-da-imagem>
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { AnthropicService } from '../src/anthropic/anthropic.service';
import { IdentificationService } from '../src/identification/identification.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VisionService } from '../src/vision/vision.service';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: ts-node scripts/identification-smoke.ts <url-ou-caminho-da-imagem>');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const anthropic = new AnthropicService(client);
  const vision = new VisionService(anthropic);
  const prisma = new PrismaService();
  const identification = new IdentificationService(anthropic, prisma);

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
