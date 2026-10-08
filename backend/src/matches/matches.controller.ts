import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../database/entities';
import { CreateMatchDto, UpdateMatchDto } from '../common/dto';
import { MatchesService } from './matches.service';

export class SimulateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  home_score!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  away_score!: number;
}

@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
  constructor(private s: MatchesService) {}

  @Get()
  async all(@Query('league_id') q?: string) {
    return { success: true, data: await this.s.all(q) };
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.s.one(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() d: CreateMatchDto) {
    return { success: true, data: await this.s.create(d) };
  }

  /** Admin: enter a final score → recompute standings, stats and dashboard. */
  @Roles(Role.ADMIN)
  @Post(':id/simulate')
  async simulate(@Param('id') id: string, @Body() dto: SimulateDto) {
    return { success: true, data: await this.s.simulate(id, dto.home_score, dto.away_score) };
  }

  /** Admin: undo the last simulation for this fixture. */
  @Roles(Role.ADMIN)
  @Post(':id/revert')
  async revert(@Param('id') id: string) {
    return { success: true, data: await this.s.revert(id) };
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() d: UpdateMatchDto) {
    return { success: true, data: await this.s.update(id, d) };
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.s.remove(id);
  }
}
