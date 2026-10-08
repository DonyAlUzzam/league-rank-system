import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Match, MatchStatus, Player, Team } from "../database/entities";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { StandingModule } from "../standings/standings.module";
@Module({
  imports: [TypeOrmModule.forFeature([Match, Player, Team]), StandingModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
