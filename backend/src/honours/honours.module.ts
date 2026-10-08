import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {TeamHonour,Team} from '../database/entities';
import {HonoursService} from './honours.service';
import {HonoursController} from './honours.controller';

@Module({
  imports:[TypeOrmModule.forFeature([TeamHonour,Team])],
  providers:[HonoursService],
  controllers:[HonoursController],
  exports:[HonoursService],
})
export class HonourModule{}
