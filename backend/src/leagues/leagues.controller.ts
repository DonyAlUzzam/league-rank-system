import {Body,Controller,Delete,Get,Param,Patch,Post} from '@nestjs/common';
import {ApiBearerAuth,ApiTags} from '@nestjs/swagger';
import {Roles} from '../auth/roles.decorator';
import {Role} from '../database/entities';
import {CreateLeagueDto,UpdateLeagueDto} from '../common/dto';
import {LeaguesService} from './leagues.service';

@ApiTags('leagues')
@ApiBearerAuth()
@Controller('leagues')
export class LeaguesController{
  constructor(private s:LeaguesService){}

  @Get()
  async all(){return {success:true,data:await this.s.all()}}

  @Get(':id')
  one(@Param('id')id:string){return this.s.one(id)}

  /** Counts used by the delete confirmation dialog. */
  @Get(':id/usage')
  usage(@Param('id')id:string){return this.s.usage(id)}

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body()d:CreateLeagueDto){return {success:true,data:await this.s.create(d)}}

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(@Param('id')id:string,@Body()d:UpdateLeagueDto){return {success:true,data:await this.s.update(id,d)}}

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id')id:string){return this.s.remove(id)}
}
