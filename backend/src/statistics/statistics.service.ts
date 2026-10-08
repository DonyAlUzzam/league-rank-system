import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Match,
  MatchStatus,
  PlayerMatchStatistic,
  Player,
  Team,
} from '../database/entities';

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Match) private m: Repository<Match>,
    @InjectRepository(PlayerMatchStatistic)
    private ps: Repository<PlayerMatchStatistic>,
    @InjectRepository(Player) private p: Repository<Player>,
    @InjectRepository(Team) private t: Repository<Team>,
  ) {}

  async teams() {
    const teams = await this.t.find();
    const matches = await this.m.find({ where: { status: MatchStatus.FINISHED } });

    return teams.map((t) => {
      let played = 0,
        wins = 0,
        draws = 0,
        losses = 0,
        gf = 0,
        ga = 0,
        hw = 0,
        aw = 0,
        hd = 0,
        ad = 0,
        hl = 0,
        al = 0;

      for (const x of matches) {
        if (x.home_team_id === t.id) {
          played++;
          gf += x.home_score || 0;
          ga += x.away_score || 0;
          if ((x.home_score || 0) > (x.away_score || 0)) {
            wins++;
            hw++;
          } else if (x.home_score === x.away_score) {
            draws++;
            hd++;
          } else {
            losses++;
            hl++;
          }
        } else if (x.away_team_id === t.id) {
          played++;
          gf += x.away_score || 0;
          ga += x.home_score || 0;
          if ((x.away_score || 0) > (x.home_score || 0)) {
            wins++;
            aw++;
          } else if (x.home_score === x.away_score) {
            draws++;
            ad++;
          } else {
            losses++;
            al++;
          }
        }
      }

      return {
        team_id: t.id,
        team: t.name,
        matches_played: played,
        wins,
        draws,
        losses,
        goals_for: gf,
        goals_against: ga,
        goal_difference: gf - ga,
        points: wins * 3 + draws,
        win_percentage: played ? +((wins / played) * 100).toFixed(2) : 0,
        home_wins: hw,
        away_wins: aw,
        home_draws: hd,
        away_draws: ad,
        home_losses: hl,
        away_losses: al,
      };
    });
  }

  /**
   * Postgres returns SUM() over integer columns as bigint → the `pg` driver
   * hands it back as a string, so coerce before it reaches the API response.
   */
  async players() {
    const rows = await this.ps
      .createQueryBuilder('s')
      .innerJoin(Player, 'p', 'p.id = s.player_id')
      .innerJoin(Team, 't', 't.id = p.team_id')
      .select('p.id', 'player_id')
      .addSelect('p.name', 'player')
      .addSelect('t.name', 'team')
      .addSelect('SUM(s.matches_played)', 'matches_played')
      .addSelect('SUM(s.goals)', 'goals')
      .addSelect('SUM(s.assists)', 'assists')
      .addSelect('SUM(s.yellow_cards)', 'yellow_cards')
      .addSelect('SUM(s.red_cards)', 'red_cards')
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('t.name')
      .orderBy('goals', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      ...r,
      matches_played: +r.matches_played || 0,
      goals: +r.goals || 0,
      assists: +r.assists || 0,
      yellow_cards: +r.yellow_cards || 0,
      red_cards: +r.red_cards || 0,
    }));
  }

  async topScorers() {
    return (await this.players())
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .map((x, i) => ({ ...x, rank: i + 1 }))
      .slice(0, 10);
  }
}
