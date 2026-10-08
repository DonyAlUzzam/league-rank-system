import { StandingService } from "./standings.service";
describe("StandingService", () => {
  it("sorts points, goal difference, goals for, wins, name", async () => {
    const m: any = {
      find: jest.fn().mockResolvedValue([
        { home_team_id: "a", away_team_id: "b", home_score: 2, away_score: 0 },
        { home_team_id: "b", away_team_id: "a", home_score: 1, away_score: 3 },
      ]),
    };
    const t: any = {
      find: jest.fn().mockResolvedValue([
        { id: "a", name: "Alpha" },
        { id: "b", name: "Beta" },
      ]),
    };
    const s = new StandingService(m, t);
    const rows = await s.calculate("l");
    expect(rows[0].team).toBe("Alpha");
    expect(rows[0].points).toBe(6);
    expect(rows[1].points).toBe(0);
  });
});
