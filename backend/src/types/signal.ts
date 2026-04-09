export interface Signal {
  id: string;
  telegramMsgId?: number;
  channelId?: string;
  asset: string;
  direction: string;
  entryTimeUtc: Date;
  expirationMinutes: number;
  expirationTime?: Date;
  formatVersion: number;
  martingaleTimes: string[];
  status: string;
  visibility: string;
  result?: string;
  galeLevel?: number;
  resultMsgId?: number;
  resolvedAt?: Date;
  rawText?: string;
  createdAt: Date;
}
