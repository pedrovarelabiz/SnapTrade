import { Request } from "express";
import { JwtPayload } from "../lib/jwt.js";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * Caller must NOT provide visibility; it is computed.
 */
export interface SignalCreateInput {
  telegramMsgId?: number;
  channelId?: string;
  asset: string;
  direction: string;
  entryTimeUtc: string;
  expirationMinutes?: number;
  expirationTime?: string;
  formatVersion?: number;
  martingaleTimes?: string[];
  rawText?: string;
}

export interface SignalResultInput {
  result: "win" | "loss";
  galeLevel?: number;
  resultMsgId?: number;
  resultIteration?: number;
  match_tier?: number;
  match_confidence?: number;
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
  lastHeartbeat: number;
  connectionTime: number;
  endpoint?: string;
}
