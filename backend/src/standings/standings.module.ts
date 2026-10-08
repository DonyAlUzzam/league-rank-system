import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Match, Team } from "../database/entities";
import { StandingService } from "./standings.service";
import { StandingController } from "./standings.controller";
@Module({
  imports: [TypeOrmModule.forFeature([Match, Team])],
  providers: [StandingService],
  controllers: [StandingController],
  exports: [StandingService],
})
export class StandingModule {}
