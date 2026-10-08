import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { League, Team, Player, Match } from "../database/entities";
import { LeaguesService } from "./leagues.service";
import { LeaguesController } from "./leagues.controller";
@Module({
  imports: [TypeOrmModule.forFeature([League, Team, Player, Match])],
  providers: [LeaguesService],
  controllers: [LeaguesController],
  exports: [LeaguesService],
})
export class LeagueModule {}
