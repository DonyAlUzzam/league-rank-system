import {Body,Controller,Delete,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {ApiBearerAuth,ApiTags} from '@nestjs/swagger';
import {Roles} from '../auth/roles.decorator';
import {Role} from '../database/entities';
import {CreatePlayerDto,UpdatePlayerDto} from '../common/dto';
import {PlayersService} from './players.service';

@ApiTags('players')
@ApiBearerAuth()
@Controller('players')
export class PlayersController{
  constructor(private s:PlayersService){}

  @Get()
  async all(@Query('team_id')q?:string){return {success:true,data:await this.s.all(q)}}

  @Get(':id')
  one(@Param('id')id:string){return this.s.one(id)}

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body()d:CreatePlayerDto){return {success:true,data:await this.s.create(d)}}

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(@Param('id')id:string,@Body()d:UpdatePlayerDto){return {success:true,data:await this.s.update(id,d)}}

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id')id:string){return this.s.remove(id)}
}
