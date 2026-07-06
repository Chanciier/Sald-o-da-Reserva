/**
 * Smoke-test REAL do VisionModule contra a API da Anthropic de verdade.
 *
 * Diferente dos testes unitários (que mockam o cliente da Anthropic), este
 * script chama a API de fato. Requer uma ANTHROPIC_API_KEY válida.
 *
 * Uso:
 *   npx ts-node scripts/vision-smoke.ts <url-da-imagem>
 *   npx ts-node scripts/vision-smoke.ts ./caminho/para/foto.jpg
 *
 * Variáveis (opcionais): ANTHROPIC_VISION_MODEL, ANTHROPIC_TIMEOUT_MS
 * Obrigatória: ANTHROPIC_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { AnthropicService } from '../src/anthropic/anthropic.service';
import { VisionService } from '../src/vision/vision.service';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: ts-node scripts/vision-smoke.ts <url-ou-caminho-da-imagem>');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const service = new VisionService(new AnthropicService(client));
  const isUrl = /^https?:\/\//i.test(arg);

  const input = isUrl
    ? { imageUrls: [arg] }
    : { imagesBase64: [readFileSync(arg).toString('base64')] };

  console.log(`Analisando ${isUrl ? 'URL' : 'arquivo'}: ${arg}`);
  console.log(`Modelo: ${process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-4-5'}`);
  console.log('Aguarde...\n');

  const started = Date.now();
  const result = await service.analyze(input);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nConcluído em ${elapsed}s.`);
}

main().catch((err) => {
  console.error('Falha:', err?.message ?? err);
  process.exit(1);
});
