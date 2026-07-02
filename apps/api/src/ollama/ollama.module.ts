import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';

/** Cliente compartilhado para o Ollama local, usado por Vision e Identification. */
@Module({
  providers: [OllamaService],
  exports: [OllamaService],
})
export class OllamaModule {}
