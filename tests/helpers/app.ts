import express from "express";
import session from "express-session";
import { env } from "../../server/src/lib/env";
import { errorHandler } from "../../server/src/middleware/errorHandler";
import agentsRouter from "../../server/src/routes/agents";
import callsRouter from "../../server/src/routes/calls";
import recommendationsRouter from "../../server/src/routes/recommendations";

export function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 86400000 },
    }),
  );
  app.use("/api/agents", agentsRouter);
  app.use("/api/calls", callsRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use(errorHandler);
  return app;
}
