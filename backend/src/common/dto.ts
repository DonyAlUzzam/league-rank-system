import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { LeagueStatus, MatchStatus, Position } from '../database/entities';

/**
 * Create/Update payloads for every creatable entity.
 *
 * They live here (rather than inside their controllers) so the bulk importer
 * can run the exact same validation on a spreadsheet row as the single-row
 * endpoint runs on a hand-built body — one source of truth for "valid".
 *
 * Every optional field is `@IsOptional()`, which class-validator treats as
 * "skip when null **or** undefined" — so an empty spreadsheet cell (sent as
 * `null`) clears the column instead of failing validation.
 */

export class CreateLeagueDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @MinLength(1) sport!: string;
  @IsString() @MinLength(1) season!: string;
  @IsDateString() start_date!: string;
  @IsDateString() end_date!: string;
  @IsIn(Object.values(LeagueStatus)) status!: LeagueStatus;
}
export class UpdateLeagueDto extends PartialType(CreateLeagueDto) {}

export class CreateTeamDto {
  @IsString() @MinLength(1) league_id!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) short_name!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() stadium?: string;
  @IsOptional() @IsString() logo_url?: string;
  /**
   * The profile fields. An empty form cell arrives as `null`, which
   * `@IsOptional()` skips — so leaving it blank *clears* the club's history
   * rather than failing validation.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(2100) founded_year?: number;
  @IsOptional() @IsString() history?: string;
}
export class UpdateTeamDto extends PartialType(CreateTeamDto) {}

export class CreateHonourDto {
  @IsString() @MinLength(1) team_id!: string;
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) competition!: string;
  @IsString() @MinLength(1) season!: string;
  @IsOptional() @IsDateString() won_at?: string;
}
export class UpdateHonourDto extends PartialType(CreateHonourDto) {}

export class CreatePlayerDto {
  @IsString() @MinLength(1) team_id!: string;
  @IsString() @MinLength(1) name!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(999) jersey_number!: number;
  @IsIn(Object.values(Position)) position!: Position;
  @IsString() @MinLength(1) nationality!: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsString() photo_url?: string;
}
export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {}

export class CreateMatchDto {
  @IsString() league_id!: string;
  @IsString() home_team_id!: string;
  @IsString() away_team_id!: string;
  @IsDateString() scheduled_at!: string;
  @IsIn(Object.values(MatchStatus)) status!: MatchStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99) home_score?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99) away_score?: number;
  @IsOptional() @IsString() venue?: string;
}
export class UpdateMatchDto extends PartialType(CreateMatchDto) {}
