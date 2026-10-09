import "reflect-metadata";
import { DataSource } from "typeorm";

import {
  League,
  Team,
  TeamHonour,
  Player,
  Match,
  PlayerMatchStatistic,
  User,
  AuditLog,
} from "./entities";

export default new DataSource({
  type: "postgres",

  host: process.env.DATABASE_HOST || "localhost",
  port: +(process.env.DATABASE_PORT || 5432),

  username: process.env.DATABASE_USER || "dony",
  password: process.env.DATABASE_PASSWORD || "postgres",
  database: process.env.DATABASE_NAME || "league_db",
  ssl: {
    rejectUnauthorized: true,
  },

  entities: [
    League,
    Team,
    TeamHonour,
    Player,
    Match,
    PlayerMatchStatistic,
    User,
    AuditLog,
  ],

  migrations: [__dirname + "/migrations/*.{js,ts}"],
});
