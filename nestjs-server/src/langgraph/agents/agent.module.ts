import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AgentFactory } from './agent.factory';
import { TopicExtractionAgent } from './topic-extraction.agent';
import { ActionItemAgent } from './action-item.agent';

@Module({
  imports: [LlmModule],
  providers: [
    AgentFactory,
    TopicExtractionAgent,
    ActionItemAgent,
  ],
  exports: [
    AgentFactory,
    TopicExtractionAgent,
    ActionItemAgent,
  ],
})
export class AgentModule {} 