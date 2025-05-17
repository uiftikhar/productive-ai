import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MeetingModule } from './meeting/meeting.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const username = configService.get<string>('MONGO_DB_USERNAME');
        const password = configService.get<string>('MONGO_DB_PASSWORD');
        const uri = configService.get<string>('MONGO_DB_URI');
        const dbName = configService.get<string>('MONGO_DB_NAME', 'meeting-analysis');

        if (!uri || !username || !password) {
          throw new Error('MongoDB configuration is missing required values');
        }

        return {
          uri: uri.replace('<username>', username).replace('<password>', password),
          dbName,
          useNewUrlParser: true,
          useUnifiedTopology: true,
        };
      },
    }),
    MeetingModule,
  ],
  exports: [MongooseModule, MeetingModule],
})
export class DatabaseModule {}
