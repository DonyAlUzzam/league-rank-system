import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Match,
  PlayerMatchStatistic,
  Player,
  Team,
} from "../database/entities";
import { StatisticsService } from "./statistics.service";
import { StatisticsController } from "./statistics.controller";
@Module({
  imports: [
    TypeOrmModule.forFeature([Match, PlayerMatchStatistic, Player, Team]),
  ],
  providers: [StatisticsService],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
