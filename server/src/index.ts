import fs from "fs";
import path from "path";
import express from "express";
import session from "express-session";
import { getDb } from "./db/init";
import "./lib/env"; // validate env at startup
import { env } from "./lib/env";
import { errorHandler } from "./middleware/errorHandler";
import agentsRouter from "./routes/agents";
import backfillRouter from "./routes/backfill";
import callsRouter from "./routes/calls";
import oauthRouter from "./routes/oauth";
import recommendationsRouter from "./routes/recommendations";
import ssoRouter from "./routes/sso";
import webhooksRouter from "./routes/webhooks";

const app = express();

// Raw body capture for webhook signature verification
app.use((req, _res, next) => {
  express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })(req, _res, next);
});

app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.HTTPS_ENABLED,
      sameSite: env.HTTPS_ENABLED ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// CSP for iframe embedding
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com",
  );
  next();
});

// Routes
app.use("/oauth", oauthRouter);
app.use("/api/sso", ssoRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/calls", callsRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/backfill", backfillRouter);

// Always serve the built Vue SPA for non-API routes
const clientDist = path.resolve("client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send("<h2>Run <code>npm run build</code> first to build the client.</h2>");
  });
}

app.use(errorHandler);

const port = Number(env.PORT);

// Initialize DB (runs migrations + crash recovery) before accepting traffic
getDb();

app.listen(port, () => {
  console.log(`\n🚀 Voice AI Copilot server running on http://localhost:${port}`);
  console.log(`   OAuth callback: ${env.GHL_REDIRECT_URI}`);
  console.log(`   Webhooks:       POST /api/webhooks/ghl`);
  console.log(`   LLM:            AnthropicAdapter (${env.LLM_MODEL ?? "claude-haiku-4-5-20251001"})\n`);
});
