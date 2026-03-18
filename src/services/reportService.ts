import { DailyReport } from '@/types';
import { mockReports } from '@/data/mockReports';

export const reportService = {
  async getReports(): Promise<DailyReport[]> {
    await new Promise(r => setTimeout(r, 400));
    return [...mockReports];
  },

  async getReportByDate(date: string): Promise<DailyReport | null> {
    await new Promise(r => setTimeout(r, 300));
    return mockReports.find(r => r.date === date) || null;
  },
};
