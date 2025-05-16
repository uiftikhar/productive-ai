import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { StorageModule } from './storage/storage.module';
import { LangGraphModule } from './langgraph/langgraph.module';
import { PineconeModule } from './pinecone/pinecone.module';
// import { EmbeddingModule } from './embedding/embedding.module';
// import { RagModule } from './rag/rag.module';
import { configValidationSchema } from './config/validation.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
    }),
    LoggingModule,
    DatabaseModule,
    AuthModule,
    StorageModule,
    LangGraphModule,
    PineconeModule,
    // EmbeddingModule,
    // RagModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
