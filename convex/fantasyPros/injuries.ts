import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { fetchFantasyPros, parseUtcDateTime, requireSuperAdmin } from "./client";

interface FantasyProsInjuryRecord {
  player_id: number;
  status: string;
  status_short: string;
  injury_type: string;
  comment: string;
  injury_update_date: string;
  ir_weeks?: number[];
  probability_of_playing: number | null;
  practice_1: string | null;
  practice_2: string | null;
  practice_3: string | null;
  practice_report_injury_type: string | null;
}

interface FantasyProsInjuriesResponse {
  injuries?: FantasyProsInjuryRecord[];
}

export const fetchInjuries = action({
  args: {},
  handler: async (ctx): Promise<{ upserted: number; removed: number }> => {
    await requireSuperAdmin(ctx);

    const data: FantasyProsInjuriesResponse = await fetchFantasyPros(
      "/nfl/injuries",
      {},
    );

    const records = data.injuries ?? [];

    return await ctx.runMutation(api.injuries.upsertInjuries, {
      rows: records.map((record) => ({
        fpid: record.player_id,
        status: record.status,
        statusShort: record.status_short,
        injuryType: record.injury_type,
        comment: record.comment,
        irWeeks: record.ir_weeks ?? [],
        probabilityOfPlaying: record.probability_of_playing,
        practice1: record.practice_1,
        practice2: record.practice_2,
        practice3: record.practice_3,
        practiceReportInjuryType: record.practice_report_injury_type,
        updatedAt: parseUtcDateTime(record.injury_update_date),
      })),
    });
  },
});
