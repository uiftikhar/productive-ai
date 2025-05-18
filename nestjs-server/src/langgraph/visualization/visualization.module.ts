import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { AgentEventService } from './agent-event.service';
import { SessionHistoryService } from './session-history.service';
import { VisualizationGateway } from './visualization.gateway';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CacheModule.register({
      ttl: 86400, // 24 hours
      max: 100,
    }),
  ],
  providers: [
    AgentEventService,
    VisualizationGateway,
    SessionHistoryService,
  ],
  exports: [AgentEventService],
})
export class VisualizationModule {} 