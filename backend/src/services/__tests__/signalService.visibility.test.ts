import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks – vi.hoisted runs before vi.mock factories
// ---------------------------------------------------------------------------
const {
  mockPrismaSignalCount,
  mockPrismaSignalFindFirst,
  mockPrismaSignalCreate,
  mockPrismaSignalFindMany,
  mockPrismaChannelFindUnique,
  mockSendSignalEvent,
  mockBroadcast,
} = vi.hoisted(() => ({
  mockPrismaSignalCount: vi.fn(),
  mockPrismaSignalFindFirst: vi.fn(),
  mockPrismaSignalCreate: vi.fn(),
  mockPrismaSignalFindMany: vi.fn(),
  mockPrismaChannelFindUnique: vi.fn(),
  mockSendSignalEvent: vi.fn(),
  mockBroadcast: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  startTransaction: vi.fn(() => ({ finish: vi.fn() })),
}));

vi.mock("../../lib/sse.js", () => ({
  sendSignalEvent: mockSendSignalEvent,
  broadcast: mockBroadcast,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    signal: {
      count: mockPrismaSignalCount,
      findFirst: mockPrismaSignalFindFirst,
      create: mockPrismaSignalCreate,
      findMany: mockPrismaSignalFindMany,
    },
    channel: {
      findUnique: mockPrismaChannelFindUnique,
    },
  },
}));

vi.mock("../../config.js", () => ({
  config: {
    freeSignalsPerDay: 3,
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
  getFreeCountToday,
  getFreeSignalVisibility,
  createSignal,
  getSignalsPaginated,
} from "../signalService.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signalService – visibility logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("getFreeCountToday", () => {
    it("returns the count of free signals created today", async () => {
      mockPrismaSignalCount.mockResolvedValueOnce(2);

      const result = await getFreeCountToday();

      expect(result).toBe(2);
      expect(mockPrismaSignalCount).toHaveBeenCalledOnce();
      const callArg = mockPrismaSignalCount.mock.calls[0][0];
      expect(callArg.where.visibility).toBe("free");
      expect(callArg.where.createdAt).toBeDefined();
    });

    it("returns 0 when no free signals exist today", async () => {
      mockPrismaSignalCount.mockResolvedValueOnce(0);

      const result = await getFreeCountToday();

      expect(result).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("getFreeSignalVisibility", () => {
    it('returns "free" when today\'s free count is below threshold (3)', async () => {
      mockPrismaSignalCount.mockResolvedValueOnce(0);
      expect(await getFreeSignalVisibility()).toBe("free");

      mockPrismaSignalCount.mockResolvedValueOnce(1);
      expect(await getFreeSignalVisibility()).toBe("free");

      mockPrismaSignalCount.mockResolvedValueOnce(2);
      expect(await getFreeSignalVisibility()).toBe("free");
    });

    it('returns "premium" when today\'s free count equals the threshold', async () => {
      mockPrismaSignalCount.mockResolvedValueOnce(3);
      expect(await getFreeSignalVisibility()).toBe("premium");
    });

    it('returns "premium" when today\'s free count exceeds the threshold', async () => {
      mockPrismaSignalCount.mockResolvedValueOnce(10);
      expect(await getFreeSignalVisibility()).toBe("premium");
    });
  });

  // -------------------------------------------------------------------------
  describe("createSignal – visibility assignment", () => {
    const baseInput = {
      asset: "EURUSD",
      direction: "call",
      entryTimeUtc: new Date().toISOString(),
    };

    it('assigns "free" visibility when threshold not reached', async () => {
      mockPrismaSignalFindFirst.mockResolvedValueOnce(null);
      mockPrismaSignalCount.mockResolvedValueOnce(1);

      const createdSignal = {
        id: "sig-1",
        asset: "EURUSD",
        direction: "call",
        entryTimeUtc: new Date(),
        visibility: "free",
        status: "pending",
        channel: null,
      };
      mockPrismaSignalCreate.mockResolvedValueOnce(createdSignal);

      const result = await createSignal({ ...baseInput, telegramMsgId: 100, channelId: "ch-1" });

      expect(result.visibility).toBe("free");
      const createCallData = mockPrismaSignalCreate.mock.calls[0][0].data;
      expect(createCallData.visibility).toBe("free");
    });

    it('assigns "premium" visibility when threshold reached', async () => {
      mockPrismaSignalFindFirst.mockResolvedValueOnce(null);
      mockPrismaSignalCount.mockResolvedValueOnce(3);

      const createdSignal = {
        id: "sig-2",
        asset: "EURUSD",
        direction: "call",
        entryTimeUtc: new Date(),
        visibility: "premium",
        status: "pending",
        channel: null,
      };
      mockPrismaSignalCreate.mockResolvedValueOnce(createdSignal);

      const result = await createSignal({ ...baseInput, telegramMsgId: 101, channelId: "ch-1" });

      expect(result.visibility).toBe("premium");
      const createCallData = mockPrismaSignalCreate.mock.calls[0][0].data;
      expect(createCallData.visibility).toBe("premium");
    });

    it("skips duplicate signals (same telegramMsgId + channelId)", async () => {
      const existingSignal = { id: "sig-existing", visibility: "free" };
      mockPrismaSignalFindFirst.mockResolvedValueOnce(existingSignal);

      const result = await createSignal({ ...baseInput, telegramMsgId: 99, channelId: "ch-1" });

      expect(result).toEqual(existingSignal);
      expect(mockPrismaSignalCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("getSignalsPaginated – visibility filter by user role", () => {
    const setupPaginatedResult = (signals: unknown[]) => {
      mockPrismaSignalFindMany.mockResolvedValueOnce(signals);
      mockPrismaSignalCount.mockResolvedValueOnce(signals.length);
    };

    it('filters to only "free" signals for basic users', async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({ page: 1, limit: 10, userRole: "user" });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.visibility).toBe("free");
    });

    it('filters to only "free" signals when no userRole provided', async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({ page: 1, limit: 10 });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.visibility).toBe("free");
    });

    it("does NOT add visibility filter for premium users", async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({ page: 1, limit: 10, userRole: "premium" });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.visibility).toBeUndefined();
    });

    it("does NOT add visibility filter for admin users", async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({ page: 1, limit: 10, userRole: "admin" });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.visibility).toBeUndefined();
    });

    it("returns correct pagination metadata", async () => {
      mockPrismaSignalFindMany.mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);
      mockPrismaSignalCount.mockResolvedValueOnce(5);

      const result = await getSignalsPaginated({ page: 1, limit: 2 });

      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(result.signals).toHaveLength(2);
    });

    it("applies asset and status filters when provided", async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({ page: 1, limit: 10, asset: "BTCUSD", status: "active" });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.asset).toBe("BTCUSD");
      expect(whereClause.status).toBe("active");
    });

    it("applies date range filter when from/to provided", async () => {
      setupPaginatedResult([]);

      await getSignalsPaginated({
        page: 1,
        limit: 10,
        from: "2026-01-01T00:00:00Z",
        to: "2026-01-31T23:59:59Z",
      });

      const whereClause = mockPrismaSignalFindMany.mock.calls[0][0].where;
      expect(whereClause.entryTimeUtc).toBeDefined();
      expect(whereClause.entryTimeUtc.gte).toBeInstanceOf(Date);
      expect(whereClause.entryTimeUtc.lte).toBeInstanceOf(Date);
    });
  });
});
