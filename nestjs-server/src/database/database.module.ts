import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        
        return {
          type: dbConfig.type,
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
          synchronize: dbConfig.synchronize,
          autoLoadEntities: true,
          logging: process.env.NODE_ENV !== 'production',
        };
      },
    }),
  ],
})
export class DatabaseModule {} 