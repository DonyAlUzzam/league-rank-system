# League Ranking System

Production-style mini full-stack sports league management application based on the supplied specification.

## Stack
- Backend: NestJS, TypeScript, PostgreSQL, TypeORM, JWT, Swagger
- Frontend: React, TypeScript, Vite, TanStack Query, Recharts-ready architecture
- Infra: Docker Compose

## Features
Authentication foundation, league/team/player/match APIs, automatic standings, team/player statistics, dashboard summary, audit-log schema, migrations, seed data, validation, pagination-ready API design, Swagger.

## Run locally
1. Start PostgreSQL and create `league_db`.
2. `cd backend && cp .env.example .env && npm install`
3. `npm run build && npm run migration:run && npm run seed && npm run start:dev`
4. In another terminal: `cd frontend && npm install && npm run dev`
5. API docs: http://localhost:3000/api/docs
6. Frontend: http://localhost:5173

Seed credentials: `admin@league.local / Admin123!` and `user@league.local / User123!`.

## Docker
`docker compose up --build`

## Standing rules
Only FINISHED matches count. Ranking: points DESC, goal difference DESC, goals for DESC, wins DESC, team name ASC. Win=3, draw=1, loss=0.

## Notes
The external sports API is intentionally optional. Add an adapter/service under a future `integrations/sports-api` module and keep imported data flowing through application services rather than directly into business logic.
