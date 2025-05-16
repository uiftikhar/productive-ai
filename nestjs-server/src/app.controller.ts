import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { EmbeddingService } from './embedding/embedding.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  
  @Post('test-embedding')
  async testEmbedding(@Body() body: { text: string }) {
    const embedding = await this.embeddingService.generateEmbedding(body.text);
    return {
      text: body.text,
      embedding_length: embedding.length,
      embedding_sample: embedding.slice(0, 5), // Return just a sample
    };
  }
}
