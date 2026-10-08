import {Injectable,NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {League,Team,Player,Match} from '../database/entities';

@Injectable()
export class LeaguesService{
  constructor(
    @InjectRepository(League) private r:Repository<League>,
    @InjectRepository(Team) private t:Repository<Team>,
    @InjectRepository(Player) private p:Repository<Player>,
    @InjectRepository(Match) private m:Repository<Match>,
  ){}

  all(){return this.r.find({order:{created_at:'DESC'}})}

  async one(id:string){
    const x=await this.r.findOne({where:{id}});
    if(!x)throw new NotFoundException('League not found');
    return x;
  }

  /**
   * Deleting a league cascades to every team, player, fixture and stat row
   * underneath it — the confirmation dialog shows these numbers.
   */
  async usage(id:string){
    const league=await this.one(id);
    const [teams,players,matches]=await Promise.all([
      this.t.count({where:{league_id:id}}),
      this.p.createQueryBuilder('p').innerJoin('p.team','t').where('t.league_id = :id',{id}).getCount(),
      this.m.count({where:{league_id:id}}),
    ]);
    return {success:true,data:{id:league.id,name:league.name,teams,players,matches}};
  }

  create(d:Partial<League>){return this.r.save(this.r.create(d))}

  async update(id:string,d:Partial<League>){
    const x=await this.one(id);
    Object.assign(x,d);
    return this.r.save(x);
  }

  async remove(id:string){
    await this.one(id);
    await this.r.delete(id);
    return {success:true};
  }
}
