import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Match,
  Team,
  League,
  PlayerMatchStatistic,
  Player,
  AuditLog,
} from '../database/entities';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { StandingModule } from '../standings/standings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Match,
      Team,
      League,
      PlayerMatchStatistic,
      Player,
      AuditLog,
    ]),
    StandingModule,
  ],
  providers: [MatchesService],
  controllers: [MatchesController],
})
export class MatchModule {}
