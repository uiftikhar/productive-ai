import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PineconeService } from './pinecone.service';
import { PineconeIndexService } from './pinecone-index.service';
import { PineconeConnectionService } from './pinecone-connection.service';
import { PineconeConfigService } from './pinecone-config.service';
import { PineconeInitializer } from './initialize-indexes';

@Module({
  imports: [ConfigModule],
  providers: [
    PineconeService,
    PineconeIndexService,
    PineconeConnectionService,
    PineconeConfigService,
    PineconeInitializer,
  ],
  exports: [
    PineconeService,
    PineconeIndexService,
    PineconeConnectionService,
  ],
})
export class PineconeModule {} 