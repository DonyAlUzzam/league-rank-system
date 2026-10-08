import {Body,Controller,Delete,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {ApiBearerAuth,ApiTags} from '@nestjs/swagger';
import {Roles} from '../auth/roles.decorator';
import {Role} from '../database/entities';
import {CreateHonourDto,UpdateHonourDto} from '../common/dto';
import {HonoursService} from './honours.service';

/**
 * Hand-entered awards only. League champions are folded in by
 * `GET /teams/:id/overview`, derived from a FINISHED league's standings.
 */
@ApiTags('honours')
@ApiBearerAuth()
@Controller('honours')
export class HonoursController{
  constructor(private s:HonoursService){}

  @Get()
  async all(@Query('team_id') team_id?:string){
    return {success:true,data:await this.s.all(team_id)};
  }

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() d:CreateHonourDto){return {success:true,data:await this.s.create(d)}}

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(@Param('id') id:string,@Body() d:UpdateHonourDto){
    return {success:true,data:await this.s.update(id,d)};
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id:string){return this.s.remove(id)}
}
