import {Injectable,BadRequestException,NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {TeamHonour,Team} from '../database/entities';
import {CreateHonourDto,UpdateHonourDto} from '../common/dto';

type HonourLike = {title:string;competition:string;season:string};

/**
 * Order-insensitive identity of an award: you cannot win the same thing twice
 * in the same season. Exported so the overview can spot a hand-typed award
 * that a league table has already settled.
 */
export const honourKey = (x:HonourLike) =>
  [x.title,x.competition,x.season].map(v=>v.trim().toLowerCase()).join('|');

@Injectable()
export class HonoursService{
  constructor(
    @InjectRepository(TeamHonour) private r:Repository<TeamHonour>,
    @InjectRepository(Team) private t:Repository<Team>,
  ){}

  /** Newest season first — a cabinet is read from the top. */
  all(team_id?:string){
    return this.r.find({
      where:team_id?{team_id}:undefined,
      order:{season:'DESC',competition:'ASC',title:'ASC'},
    });
  }

  async one(id:string){
    const x=await this.r.findOne({where:{id}});
    if(!x)throw new NotFoundException('Honour not found');
    return x;
  }

  async create(d:CreateHonourDto){
    if(!await this.t.exists({where:{id:d.team_id}}))
      throw new NotFoundException('Team not found');
    await this.assertUnique(d.team_id,d);
    return this.r.save(this.r.create(d));
  }

  async update(id:string,d:UpdateHonourDto){
    const x=await this.one(id);
    if(d.team_id && !await this.t.exists({where:{id:d.team_id}}))
      throw new NotFoundException('Team not found');
    const merged={...x,...d};
    await this.assertUnique(merged.team_id,merged,id);
    Object.assign(x,d);
    return this.r.save(x);
  }

  async remove(id:string){
    await this.one(id);
    await this.r.delete(id);
    return {success:true};
  }

  private async assertUnique(team_id:string,candidate:HonourLike,ignore?:string){
    const rows=await this.r.find({where:{team_id}});
    const k=honourKey(candidate);
    if(rows.some(r=>r.id!==ignore&&honourKey(r)===k))
      throw new BadRequestException(
        `"${candidate.title}" · ${candidate.competition} (${candidate.season}) is already recorded for this club`,
      );
  }
}
