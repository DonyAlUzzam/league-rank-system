import {Controller,Get} from '@nestjs/common';
import {ApiBearerAuth} from '@nestjs/swagger';
import {DashboardService} from './dashboard.service';

@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController{
  constructor(private s:DashboardService){}

  @Get()
  async get(){return {success:true,data:await this.s.get()}}
}
