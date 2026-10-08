import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Team,League,Match,Player,PlayerMatchStatistic} from '../database/entities';
import {StandingModule} from '../standings/standings.module';
import {HonourModule} from '../honours/honours.module';
import {TeamsService} from './teams.service';
import {TeamsController} from './teams.controller';

@Module({
  imports:[
    TypeOrmModule.forFeature([Team,League,Match,Player,PlayerMatchStatistic]),
    StandingModule,   // league position + champion title for /overview
    HonourModule,     // trophy cabinet for /overview
  ],
  providers:[TeamsService],
  controllers:[TeamsController],
  exports:[TeamsService],
})
export class TeamModule{}
