import { Module } from '@nestjs/common';
import { LlmModule } from '../../llm/llm.module';
import { AgentModule } from '../agent.module';
import { VisualizationModule } from '../../visualization/visualization.module';
import { SupervisorAgent } from './supervisor.agent';

@Module({
  imports: [LlmModule, AgentModule, VisualizationModule],
  providers: [SupervisorAgent],
  exports: [SupervisorAgent],
})
export class SupervisorModule {}
