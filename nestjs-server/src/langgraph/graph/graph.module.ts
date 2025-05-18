import { Module } from '@nestjs/common';
import { AgentModule } from '../agents/agent.module';
import { StateModule } from '../state/state.module';
import { GraphService } from './graph.service';
import { WorkflowService } from './workflow.service';
import { SupervisorModule } from '../agents/supervisor/supervisor.module';
import { VisualizationModule } from '../visualization/visualization.module';

@Module({
  imports: [AgentModule, StateModule, SupervisorModule, VisualizationModule],
  providers: [GraphService, WorkflowService],
  exports: [GraphService, WorkflowService],
})
export class GraphModule {}
