import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import router from "./routes";
import { logger } from "./lib/logger";
import "./types/express.d.ts";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Assign a persistent anonymous user ID via cookie
app.use((req, res, next) => {
  let uid = req.cookies["codexframe_uid"] as string | undefined;
  if (!uid) {
    uid = randomUUID();
    res.cookie("codexframe_uid", uid, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      path: "/",
    });
  }
  req.userId = uid;
  next();
});

app.use("/api", router);

export default app;
