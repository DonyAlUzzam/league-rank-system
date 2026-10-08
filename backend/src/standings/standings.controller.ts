import {Controller,Get,Param} from '@nestjs/common';
import {ApiBearerAuth} from '@nestjs/swagger';
import {StandingService} from './standings.service';

@ApiBearerAuth()
@Controller('leagues')
export class StandingController{
  constructor(private s:StandingService){}

  @Get(':id/standings')
  async get(@Param('id')id:string){return {success:true,data:await this.s.calculate(id)}}
}
