import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ANTHROPIC_CLIENT } from './anthropic.constants';
import { AnthropicService } from './anthropic.service';

/** Cliente compartilhado para a API da Anthropic, usado por Vision e Identification. */
@Module({
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    },
    AnthropicService,
  ],
  exports: [AnthropicService],
})
export class AnthropicModule {}
