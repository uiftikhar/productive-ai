import { Module } from '@nestjs/common';
import { LlmModule } from './llm/llm.module';
import { ToolModule } from './tools/tool.module';
import { StateModule } from './state/state.module';
import { AgentModule } from './agents/agent.module';
import { SupervisorModule } from './agents/supervisor/supervisor.module';
import { TeamModule } from './agents/team/team.module';
import { GraphModule } from './graph/graph.module';
import { MeetingAnalysisModule } from './meeting-analysis/meeting-analysis.module';
import { ExternalIntegrationModule } from './tools/external-integration.module';

@Module({
  imports: [
    LlmModule,
    ToolModule,
    StateModule,
    AgentModule,
    SupervisorModule,
    TeamModule,
    GraphModule,
    MeetingAnalysisModule,
    ExternalIntegrationModule,
  ],
  exports: [
    LlmModule,
    ToolModule,
    StateModule,
    AgentModule,
    SupervisorModule,
    TeamModule,
    GraphModule,
    MeetingAnalysisModule,
    ExternalIntegrationModule,
  ],
})
export class LangGraphModule {}
