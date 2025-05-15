import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { LangGraphModule } from './langgraph/langgraph.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    StorageModule,
    AuthModule,
    LangGraphModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
