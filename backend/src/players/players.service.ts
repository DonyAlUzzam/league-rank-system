import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Player, Team } from "../database/entities";
@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(Player) private r: Repository<Player>,
    @InjectRepository(Team) private t: Repository<Team>,
  ) {}
  all(team_id?: string) {
    return this.r.find({
      where: team_id ? { team_id } : undefined,
      relations: { team: true },
      order: { name: "ASC" },
    });
  }
  async one(id: string) {
    const x = await this.r.findOne({
      where: { id },
      relations: { team: true },
    });
    if (!x) throw new NotFoundException("Player not found");
    return x;
  }
  async create(d: Partial<Player>) {
    if (!(await this.t.exists({ where: { id: d.team_id } })))
      throw new NotFoundException("Team not found");
    return this.r.save(this.r.create(d));
  }
  async update(id: string, d: Partial<Player>) {
    const x = await this.one(id);
    Object.assign(x, d);
    return this.r.save(x);
  }
  async remove(id: string) {
    await this.one(id);
    await this.r.delete(id);
    return { success: true };
  }
}
