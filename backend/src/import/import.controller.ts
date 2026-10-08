import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../database/entities';
import { ImportService, Row } from './import.service';

export class ImportDto {
  /**
   * Normalised data rows — the file's header row has already been mapped to
   * field names and its cells coerced by the browser, so the backend only has
   * to resolve references and validate.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  rows!: Row[];
}

@ApiTags('import')
@ApiBearerAuth()
@Controller('import')
export class ImportController {
  constructor(private s: ImportService) {}

  /**
   * Bulk create/update from an uploaded spreadsheet.
   *
   * All-or-nothing: rows with a blank `id` are created, rows carrying an `id`
   * are updated, and any problem anywhere in the batch aborts the whole thing
   * with a per-row report — nothing is written.
   *
   * `entity` is one of `leagues | teams | players | matches`.
   */
  @Roles(Role.ADMIN)
  @Post(':entity')
  async run(@Param('entity') entity: string, @Body() dto: ImportDto) {
    return { success: true, data: await this.s.run(entity, dto.rows) };
  }
}
