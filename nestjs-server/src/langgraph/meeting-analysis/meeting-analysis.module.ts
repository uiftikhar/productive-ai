import { Module } from '@nestjs/common';
import { MeetingAnalysisController } from './meeting-analysis.controller';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { GraphModule } from '../graph/graph.module';
import { StateModule } from '../state/state.module';
import { AgentModule } from '../agents/agent.module';
import { SupervisorModule } from '../agents/supervisor/supervisor.module';
import { TeamModule } from '../agents/team/team.module';

@Module({
  imports: [
    GraphModule,
    StateModule,
    AgentModule,
    SupervisorModule,
    TeamModule,
  ],
  controllers: [MeetingAnalysisController],
  providers: [MeetingAnalysisService],
  exports: [MeetingAnalysisService],
})
export class MeetingAnalysisModule {} 