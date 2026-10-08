import {Injectable,BadRequestException,NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {In,Repository} from 'typeorm';
import {
  Team,League,Match,Player,PlayerMatchStatistic,
  MatchStatus,LeagueStatus,
} from '../database/entities';
import {CreateTeamDto,UpdateTeamDto} from '../common/dto';
import {StandingService} from '../standings/standings.service';
import {HonoursService,honourKey} from '../honours/honours.service';

/** One finished fixture, rewritten from the point of view of `teamId`. */
type Appearance = {
  id: string;
  opponent_id: string;
  opponent: string;
  home: boolean;
  gf: number;
  ga: number;
  /** null while the fixture is still to be played. */
  result: 'W' | 'D' | 'L' | null;
  scheduled_at: Date;
  status: MatchStatus;
  venue?: string;
};

/** A settled fixture — narrows the union so callers never see a null result. */
const settled = (
  x: Appearance,
): x is Appearance & { result: 'W' | 'D' | 'L' } => x.result !== null;

/**
 * What `GET /teams/:id/overview` hands back for the trophy cabinet.
 * `id: null` marks a title derived from a league table — there is no row to
 * edit or delete, only a league status that can be changed.
 */
type HonourOut = {
  id: string | null;
  team_id: string;
  title: string;
  competition: string;
  season: string;
  won_at?: string | null;
  source: 'LEAGUE' | 'MANUAL';
  league_id?: string;
};

@Injectable()
export class TeamsService{
  constructor(
    @InjectRepository(Team) private r:Repository<Team>,
    @InjectRepository(League) private l:Repository<League>,
    @InjectRepository(Match) private m:Repository<Match>,
    @InjectRepository(Player) private p:Repository<Player>,
    @InjectRepository(PlayerMatchStatistic) private ps:Repository<PlayerMatchStatistic>,
    private standing:StandingService,
    private honours:HonoursService,
  ){}

  all(league_id?:string){return this.r.find({where:league_id?{league_id}:undefined,order:{name:'ASC'}})}

  async one(id:string){
    const x=await this.r.findOne({where:{id},relations:{league:true}});
    if(!x)throw new NotFoundException('Team not found');
    return x;
  }

  /**
   * Everything the club page shows, in one round trip: profile, league
   * position, per-player output, every fixture rewritten from this club's
   * view, recent form, and the trophy cabinet (stored awards plus the
   * champion's title this club can claim from a FINISHED league).
   */
  async overview(id:string){
    const team=await this.one(id);
    const league=team.league;

    const players=await this.p.find({where:{team_id:id},order:{jersey_number:'ASC'}});
    const [raw,fixtures,stored,table]=await Promise.all([
      players.length
        ? this.ps.find({where:{player_id:In(players.map(p=>p.id))}})
        : Promise.resolve([]),
      this.m.find({
        where:[{home_team_id:id},{away_team_id:id}],
        order:{scheduled_at:'DESC'},
      }),
      this.honours.all(id),
      this.standing.calculate(team.league_id),
    ]);

    // ---- squad, with career output rolled up from player_match_statistics ----
    const agg=new Map<string,{apps:number;goals:number;assists:number;yellow_cards:number;red_cards:number}>();
    for(const s of raw){
      const a=agg.get(s.player_id)??{apps:0,goals:0,assists:0,yellow_cards:0,red_cards:0};
      a.apps+=s.matches_played; a.goals+=s.goals; a.assists+=s.assists;
      a.yellow_cards+=s.yellow_cards; a.red_cards+=s.red_cards;
      agg.set(s.player_id,a);
    }
    const squad=players.map(p=>({
      ...p,
      ...(agg.get(p.id)??{apps:0,goals:0,assists:0,yellow_cards:0,red_cards:0}),
    }));

    // ---- fixtures, split and rewritten from this club's side ----
    const wanted=new Set<string>([id]);
    for(const x of fixtures){wanted.add(x.home_team_id);wanted.add(x.away_team_id);}
    const named=await this.r.find({where:{id:In([...wanted])}});
    const teamName=new Map(named.map(t=>[t.id,t.name]));

    const view=(m:Match):Appearance=>{
      const home=m.home_team_id===id;
      const gf=(home?m.home_score:m.away_score)??0;
      const ga=(home?m.away_score:m.home_score)??0;
      const opp=home?m.away_team_id:m.home_team_id;
      const counted=m.status===MatchStatus.FINISHED&&m.home_score!=null&&m.away_score!=null;
      return {
        id:m.id,opponent_id:opp,
        opponent:teamName.get(opp)??'Unknown team',
        home,gf,ga,
        // null until the fixture is actually settled — an upcoming match has
        // no result, and pretending it is a draw would be a lie.
        result:counted?(gf>ga?'W':gf<ga?'L':'D'):null,
        scheduled_at:m.scheduled_at,status:m.status,venue:m.venue,
      };
    };

    const viewed=fixtures.map(view);
    const finished=viewed.filter(settled);
    const upcoming=viewed
      .filter(x=>!settled(x))
      .sort((a,b)=>+new Date(a.scheduled_at)-+new Date(b.scheduled_at));

    // ---- season record + league position ----
    let won=0,draw=0,lost=0,gf=0,ga=0;
    for(const x of finished){
      gf+=x.gf; ga+=x.ga;
      if(x.result==='W')won++; else if(x.result==='D')draw++; else lost++;
    }
    const played=finished.length;
    const row=table.find(x=>x.team_id===id);

    // ---- trophy cabinet ----
    const derived:HonourOut[]=[];
    if(league?.status===LeagueStatus.FINISHED&&table[0]?.team_id===id)
      derived.push({
        id:null,team_id:id,title:'Champion',
        competition:league.name,season:league.season,won_at:null,
        source:'LEAGUE',league_id:league.id,
      });
    // A hand-typed "Champion" for a season the league already settles is the
    // same fact twice — the derived one wins because it cannot go stale.
    const seen=new Set(derived.map(honourKey));
    const manual:HonourOut[]=stored
      .filter(h=>!seen.has(honourKey(h)))
      .map(h=>({
        id:h.id,team_id:h.team_id,title:h.title,
        competition:h.competition,season:h.season,won_at:h.won_at,
        source:'MANUAL',
      }));
    const honours=[...derived,...manual]
      .sort((a,b)=>b.season.localeCompare(a.season)||a.competition.localeCompare(b.competition));

    return {
      success:true,
      data:{
        team,
        squad,
        finished,
        upcoming,
        form:finished.slice(0,10).reverse().map(x=>x.result),
        honours,
        record:{
          position:row?.position??table.length,
          played,won,draw,lost,
          goals_for:gf,goals_against:ga,goal_difference:gf-ga,
          points:won*3+draw,
          win_percentage:played?+((won/played)*100).toFixed(2):0,
        },
      },
    };
  }

  /**
   * What deleting this team would touch. `matches.home/away_team_id` have no
   * ON DELETE clause, so the UI must be told *before* the request, not via a
   * 500 afterwards.
   */
  async usage(id:string){
    const team=await this.one(id);
    const [players,fixtures]=await Promise.all([
      this.p.count({where:{team_id:id}}),
      this.m.count({where:[{home_team_id:id},{away_team_id:id}]}),
    ]);
    return {success:true,data:{id:team.id,name:team.name,players,fixtures}};
  }

  async create(d:CreateTeamDto|Partial<Team>){
    if(!await this.l.exists({where:{id:d.league_id}}))throw new BadRequestException('League not found');
    return this.r.save(this.r.create(d));
  }

  async update(id:string,d:UpdateTeamDto|Partial<Team>){
    const x=await this.one(id);
    if(d.league_id && d.league_id!==x.league_id && !await this.l.exists({where:{id:d.league_id}}))
      throw new BadRequestException('League not found');
    Object.assign(x,d);
    return this.r.save(x);
  }

  /** Blocked while the team still has fixtures; its players cascade away. */
  async remove(id:string){
    const team=await this.one(id);
    const fixtures=await this.m.count({where:[{home_team_id:id},{away_team_id:id}]});
    if(fixtures>0)
      throw new BadRequestException(
        `"${team.name}" still has ${fixtures} fixture(s) — delete those fixtures first`,
      );
    const players=await this.p.count({where:{team_id:id}});
    await this.r.delete(id);
    return {success:true,data:{players_removed:players}};
  }
}
