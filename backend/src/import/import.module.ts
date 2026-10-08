import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, League, Match, Player, Team } from '../database/entities';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [TypeOrmModule.forFeature([League, Team, Player, Match, AuditLog])],
  providers: [ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
