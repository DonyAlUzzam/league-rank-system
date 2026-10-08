import {Body,Controller,Delete,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {ApiBearerAuth,ApiTags} from '@nestjs/swagger';
import {Roles} from '../auth/roles.decorator';
import {Role} from '../database/entities';
import {CreateTeamDto,UpdateTeamDto} from '../common/dto';
import {TeamsService} from './teams.service';

@ApiTags('teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController{
  constructor(private s:TeamsService){}

  @Get()
  async all(@Query('league_id')q?:string){return {success:true,data:await this.s.all(q)}}

  @Get(':id')
  one(@Param('id')id:string){return this.s.one(id)}

  /** Profile, position, squad output, fixtures and honours in one call. */
  @Get(':id/overview')
  overview(@Param('id')id:string){return this.s.overview(id)}

  /** Counts used by the delete confirmation dialog. */
  @Get(':id/usage')
  usage(@Param('id')id:string){return this.s.usage(id)}

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body()d:CreateTeamDto){return {success:true,data:await this.s.create(d)}}

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(@Param('id')id:string,@Body()d:UpdateTeamDto){return {success:true,data:await this.s.update(id,d)}}

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id')id:string){return this.s.remove(id)}
}
