import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

// ============================================================
// ENUMS
// ============================================================

export enum LeagueStatus {
  UPCOMING = 'UPCOMING',
  ONGOING = 'ONGOING',
  FINISHED = 'FINISHED',
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  FINISHED = 'FINISHED',
  POSTPONED = 'POSTPONED',
  CANCELLED = 'CANCELLED',
}

export enum Position {
  GOALKEEPER = 'GOALKEEPER',
  DEFENDER = 'DEFENDER',
  MIDFIELDER = 'MIDFIELDER',
  FORWARD = 'FORWARD',
}

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

// ============================================================
// USER
// ============================================================

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    unique: true,
  })
  email!: string;

  @Column({
    type: 'varchar',
  })
  password!: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  role!: Role;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// LEAGUE
// ============================================================

@Entity('leagues')
export class League {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
  })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @Column({
    type: 'varchar',
  })
  sport!: string;

  @Column({
    type: 'varchar',
  })
  season!: string;

  @Column({
    type: 'date',
  })
  start_date!: string;

  @Column({
    type: 'date',
  })
  end_date!: string;

  @Column({
    type: 'enum',
    enum: LeagueStatus,
  })
  status!: LeagueStatus;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// TEAM
// ============================================================

@Entity('teams')
@Index(['league_id'])
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
  })
  league_id!: string;

  @ManyToOne(() => League, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'league_id',
  })
  league!: League;

  @Column({
    type: 'varchar',
  })
  name!: string;

  @Column({
    type: 'varchar',
  })
  short_name!: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  logo_url?: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  city?: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  stadium?: string;

  @Column({
    type: 'int',
    nullable: true,
  })
  founded_year?: number | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  history?: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// TEAM HONOUR — what a club has won by hand.
// League champions are derived from a FINISHED league's standings instead of
// stored here, so this table only ever holds admin-entered awards.
// ============================================================

@Entity('team_honours')
@Index(['team_id'])
export class TeamHonour {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
  })
  team_id!: string;

  @ManyToOne(() => Team, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'team_id',
  })
  team!: Team;

  /** What was won, e.g. "Champion", "Runner-up", "Piala Presisi". */
  @Column({
    type: 'varchar',
  })
  title!: string;

  /** Where it was won, e.g. "Indonesia Premier League". */
  @Column({
    type: 'varchar',
  })
  competition!: string;

  /** "2026", "2024/25" — whatever the club calls that campaign. */
  @Column({
    type: 'varchar',
  })
  season!: string;

  @Column({
    type: 'date',
    nullable: true,
  })
  won_at?: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// PLAYER
// ============================================================

@Entity('players')
@Index(['team_id'])
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
  })
  team_id!: string;

  @ManyToOne(() => Team, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'team_id',
  })
  team!: Team;

  @Column({
    type: 'varchar',
  })
  name!: string;

  @Column({
    type: 'int',
  })
  jersey_number!: number;

  @Column({
    type: 'enum',
    enum: Position,
  })
  position!: Position;

  @Column({
    type: 'varchar',
  })
  nationality!: string;

  @Column({
    type: 'date',
    nullable: true,
  })
  date_of_birth?: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  photo_url?: string;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// MATCH
// ============================================================

@Entity('matches')
@Index(['league_id'])
@Index(['home_team_id'])
@Index(['away_team_id'])
@Index(['status'])
@Index(['scheduled_at'])
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
  })
  league_id!: string;

  @Column({
    type: 'uuid',
  })
  home_team_id!: string;

  @Column({
    type: 'uuid',
  })
  away_team_id!: string;

  @Column({
    type: 'timestamptz',
  })
  scheduled_at!: Date;

  @Column({
    type: 'enum',
    enum: MatchStatus,
  })
  status!: MatchStatus;

  @Column({
    type: 'int',
    nullable: true,
  })
  home_score?: number | null;

  @Column({
    type: 'int',
    nullable: true,
  })
  away_score?: number | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  venue?: string;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updated_at!: Date;
}

// ============================================================
// PLAYER MATCH STATISTIC
// ============================================================

@Entity('player_match_statistics')
@Index(['player_id', 'match_id'], {
  unique: true,
})
export class PlayerMatchStatistic {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
  })
  player_id!: string;

  @Column({
    type: 'uuid',
  })
  match_id!: string;

  @Column({
    type: 'int',
    default: 0,
  })
  matches_played!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  goals!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  assists!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  yellow_cards!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  red_cards!: number;
}

// ============================================================
// AUDIT LOG
// ============================================================

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  user_id?: string;

  @Column({
    type: 'varchar',
  })
  action!: string;

  @Column({
    type: 'varchar',
  })
  entity!: string;

  @Column({
    type: 'uuid',
  })
  entity_id!: string;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  old_data?: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  new_data?: Record<string, unknown>;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  created_at!: Date;
}
