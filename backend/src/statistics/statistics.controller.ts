import {Controller,Get} from '@nestjs/common';
import {ApiBearerAuth} from '@nestjs/swagger';
import {StatisticsService} from './statistics.service';

@ApiBearerAuth()
@Controller('statistics')
export class StatisticsController{
  constructor(private s:StatisticsService){}

  @Get('teams')
  async teams(){return {success:true,data:await this.s.teams()}}

  @Get('players')
  async players(){return {success:true,data:await this.s.players()}}

  @Get('top-scorers')
  async top(){return {success:true,data:await this.s.topScorers()}}
}
