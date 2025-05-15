import { Module } from '@nestjs/common';
import { StateService } from './state.service';
import { LangGraphPersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [LangGraphPersistenceModule],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {} 