import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthModule } from './auth/auth.module';
import { League,Team,TeamHonour,Player,Match,PlayerMatchStatistic,User,AuditLog } from './database/entities';
import { LeagueModule } from './leagues/leagues.module'; import { TeamModule } from './teams/teams.module'; import { PlayerModule } from './players/players.module'; import { MatchModule } from './matches/matches.module'; import { StandingModule } from './standings/standings.module'; import { StatisticsModule } from './statistics/statistics.module'; import { DashboardModule } from './dashboard/dashboard.module';
import { ImportModule } from './import/import.module';
import { HonourModule } from './honours/honours.module';
@Module({imports:[ConfigModule.forRoot({isGlobal:true}),TypeOrmModule.forRoot({type:'postgres',host:process.env.DATABASE_HOST,port:+(process.env.DATABASE_PORT||5432),username:process.env.DATABASE_USER,password:process.env.DATABASE_PASSWORD,database:process.env.DATABASE_NAME,entities:[League,Team,TeamHonour,Player,Match,PlayerMatchStatistic,User,AuditLog],migrations:[__dirname+'/database/migrations/*.{js,ts}'],migrationsRun:true,synchronize:false}),AuthModule,LeagueModule,TeamModule,PlayerModule,MatchModule,StandingModule,StatisticsModule,DashboardModule,ImportModule,HonourModule]}) export class AppModule {}
