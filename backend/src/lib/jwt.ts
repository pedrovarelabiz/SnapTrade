import jwt from "jsonwebtoken";
import { Response } from "express";
import { config } from "../config.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  subscription?: any;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionDurationHours}h` });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

export function setTokenCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function clearTokenCookie(res: Response): void {
  res.clearCookie("token", { path: "/" });
}
