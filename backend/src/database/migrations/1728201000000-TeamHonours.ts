import {MigrationInterface,QueryRunner} from 'typeorm';

/**
 * Club profile + trophy cabinet.
 *
 * `teams` gains a founded year and a free-text history so the detail page has
 * something to say about the club itself; `team_honours` records what the club
 * has won. League champions are *not* stored here — they are derived from a
 * FINISHED league's standings on read, so a table edit can never desynchronise
 * the two.
 */
export class TeamHonours1728201000000 implements MigrationInterface{
  async up(q:QueryRunner){
    await q.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS founded_year int, ADD COLUMN IF NOT EXISTS history text;`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS team_honours(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        title varchar NOT NULL,
        competition varchar NOT NULL,
        season varchar NOT NULL,
        won_at date,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_team_honours_team ON team_honours(team_id);
    `);
  }

  async down(q:QueryRunner){
    await q.query(`DROP TABLE IF EXISTS team_honours CASCADE;`);
    await q.query(`ALTER TABLE teams DROP COLUMN IF EXISTS founded_year, DROP COLUMN IF EXISTS history;`);
  }
}
