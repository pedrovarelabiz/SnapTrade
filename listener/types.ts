import { Request } from "express";
import { JwtPayload } from "../lib/jwt.js";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface SignalCreateInput {
  telegramMsgId?: number;
  channelId?: string;
  asset: string;
  direction: string;
  entryTimeUtc: string;
  expirationMinutes?: number;
  formatVersion?: number;
  martingaleTimes?: string[];
  rawText?: string;
}

export interface SignalResultInput {
  result: "win" | "loss";
  galeLevel?: number;
  resultMsgId?: number;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  asset?: string;
  status?: string;
  from?: string;
  to?: string;
  channel?: string;
}

export interface SSEClient {
  id: string;
  res: import("express").Response;
  userId: string;
  role: string;
}
