/**
 * Smoke-test REAL do VisionModule contra um Ollama de verdade.
 *
 * Diferente dos testes unitários (que mockam o Ollama), este script chama o
 * modelo local de fato. Use quando o Ollama estiver instalado e o modelo
 * baixado.
 *
 * Pré-requisitos:
 *   1. Instalar Ollama:      https://ollama.com/download
 *   2. Baixar o modelo:      ollama pull qwen2.5vl
 *      (o daemon já sobe sozinho; confira: curl http://127.0.0.1:11434/api/tags)
 *
 * Uso:
 *   npx ts-node scripts/vision-smoke.ts <url-da-imagem>
 *   npx ts-node scripts/vision-smoke.ts ./caminho/para/foto.jpg
 *
 * Variáveis (opcionais): OLLAMA_BASE_URL, OLLAMA_VISION_MODEL, OLLAMA_TIMEOUT_MS
 */
import { readFileSync } from 'fs';
import { OllamaService } from '../src/ollama/ollama.service';
import { VisionService } from '../src/vision/vision.service';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: ts-node scripts/vision-smoke.ts <url-ou-caminho-da-imagem>');
    process.exit(1);
  }

  const service = new VisionService(new OllamaService());
  const isUrl = /^https?:\/\//i.test(arg);

  const input = isUrl
    ? { imageUrls: [arg] }
    : { imagesBase64: [readFileSync(arg).toString('base64')] };

  console.log(`Analisando ${isUrl ? 'URL' : 'arquivo'}: ${arg}`);
  console.log(`Modelo: ${process.env.OLLAMA_VISION_MODEL ?? 'qwen2.5vl'}`);
  console.log('Aguarde (a primeira execução carrega o modelo e pode demorar)...\n');

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
