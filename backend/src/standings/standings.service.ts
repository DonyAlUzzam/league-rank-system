import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Match, Team, MatchStatus } from "../database/entities";
export type Standing = {
  position: number;
  team_id: string;
  team: string;
  logo_url?: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};
@Injectable()
export class StandingService {
  constructor(
    @InjectRepository(Match) private m: Repository<Match>,
    @InjectRepository(Team) private t: Repository<Team>,
  ) {}
  async calculate(leagueId: string): Promise<Standing[]> {
    const teams = await this.t.find({ where: { league_id: leagueId } });
    const matches = await this.m.find({
      where: { league_id: leagueId, status: MatchStatus.FINISHED },
    });
    const map = new Map<string, Standing>();
    for (const t of teams)
      map.set(t.id, {
        position: 0,
        team_id: t.id,
        team: t.name,
        logo_url: t.logo_url,
        played: 0,
        won: 0,
        draw: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        points: 0,
      });
    for (const x of matches) {
      if (x.home_score == null || x.away_score == null) continue;
      const h = map.get(x.home_team_id),
        a = map.get(x.away_team_id);
      if (!h || !a) continue;
      h.played++;
      a.played++;
      h.goals_for += x.home_score;
      h.goals_against += x.away_score;
      a.goals_for += x.away_score;
      a.goals_against += x.home_score;
      if (x.home_score > x.away_score) {
        h.won++;
        h.points += 3;
        a.lost++;
      } else if (x.home_score < x.away_score) {
        a.won++;
        a.points += 3;
        h.lost++;
      } else {
        h.draw++;
        a.draw++;
        h.points++;
        a.points++;
      }
    }
    const rows = [...map.values()].map((x) => ({
      ...x,
      goal_difference: x.goals_for - x.goals_against,
    }));
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_difference - a.goal_difference ||
        b.goals_for - a.goals_for ||
        b.won - a.won ||
        a.team.localeCompare(b.team),
    );
    rows.forEach((x, i) => (x.position = i + 1));
    return rows;
  }
}
