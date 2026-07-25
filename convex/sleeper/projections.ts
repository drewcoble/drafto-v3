import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { POSITIONS } from "../positions";
import {
  currentSeason,
  DEF_TEAM_FPIDS,
  fetchSleeper,
  POSITION_SLUGS,
  requireSuperAdmin,
} from "./client";

type Position = (typeof POSITIONS)[number];

interface SleeperPlayer {
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
}

interface SleeperProjectionRecord {
  player_id: string;
  team: string | null;
  stats?: Record<string, number | undefined>;
  player?: SleeperPlayer;
}

const SLEEPER_TO_OUR_POSITION: Record<string, Position> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  DEF: "DST",
};

export const fetchProjections = action({
  args: {
    week: v.string(),
    season: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Record<
      Position,
      {
        players: { inserted: number; updated: number };
        projections: { upserted: number; removed: number };
        rankings: { upserted: number; removed: number };
      }
    >
  > => {
    await requireSuperAdmin(ctx);

    const season = args.season ?? currentSeason();
    // The app's "draft" (season-long) sentinel maps to omitting the week
    // path segment entirely - that's Sleeper's season-long projections mode.
    const apiWeek = args.week === "draft" ? undefined : args.week;

    const records: SleeperProjectionRecord[] = await fetchSleeper(
      season,
      apiWeek,
      Object.values(POSITION_SLUGS),
    );

    // The combined position[] filter lets a handful of secondary-position
    // players leak through (e.g. FB tagged RB-eligible) - enforce an exact
    // match against the positions we actually asked for.
    const bySleeperPosition = new Map<string, SleeperProjectionRecord[]>();
    for (const record of records) {
      const sleeperPosition = record.player?.position;
      if (!sleeperPosition || !(sleeperPosition in SLEEPER_TO_OUR_POSITION)) {
        continue;
      }
      const list = bySleeperPosition.get(sleeperPosition) ?? [];
      list.push(record);
      bySleeperPosition.set(sleeperPosition, list);
    }

    const results: Partial<
      Record<
        Position,
        {
          players: { inserted: number; updated: number };
          projections: { upserted: number; removed: number };
          rankings: { upserted: number; removed: number };
        }
      >
    > = {};

    for (const position of POSITIONS) {
      const sleeperSlug = POSITION_SLUGS[position];
      const positionRecords = bySleeperPosition.get(sleeperSlug) ?? [];

      if (positionRecords.length === 0) {
        throw new Error(
          `Sleeper API returned no players for ${position} (season=${season}, week=${args.week}).`,
        );
      }

      const playerRows = [];
      const projectionRows = [];
      const rankingRows = [];

      for (const record of positionRecords) {
        const fpid =
          position === "DST"
            ? DEF_TEAM_FPIDS[record.team ?? ""]
            : Number(record.player_id);

        if (!fpid) {
          // No known synthetic id for this team abbreviation - skip rather
          // than store a bogus fpid of 0/NaN.
          continue;
        }

        const name =
          `${record.player?.first_name ?? ""} ${record.player?.last_name ?? ""}`.trim();
        const team = record.team ?? null;
        const stats = { ...(record.stats ?? {}) };

        const pointsStd = stats.pts_std ?? 0;
        const pointsPpr = stats.pts_ppr ?? 0;
        const pointsHalf = stats.pts_half_ppr ?? 0;
        const adpStd = stats.adp_std ?? 999;
        const adpPpr = stats.adp_ppr ?? 999;
        const adpHalf = stats.adp_half_ppr ?? 999;

        const numericStats: Record<string, number> = {};
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value === "number" && !key.startsWith("pts_") && !key.startsWith("adp_")) {
            numericStats[key] = value;
          }
        }

        playerRows.push({ fpid, name, position, team });
        projectionRows.push({
          fpid,
          name,
          team,
          pointsStd,
          pointsPpr,
          pointsHalf,
          stats: numericStats,
        });
        rankingRows.push({ fpid, adpStd, adpPpr, adpHalf });
      }

      const playersResult = await ctx.runMutation(api.players.upsertPlayers, {
        rows: playerRows,
      });
      const projectionsResult = await ctx.runMutation(
        api.projections.upsertProjections,
        { position, season, week: args.week, rows: projectionRows },
      );
      const rankingsResult = await ctx.runMutation(
        api.rankings.upsertRankings,
        { position, season, week: args.week, rows: rankingRows },
      );

      results[position] = {
        players: playersResult,
        projections: projectionsResult,
        rankings: rankingsResult,
      };
    }

    return results as Record<
      Position,
      {
        players: { inserted: number; updated: number };
        projections: { upserted: number; removed: number };
        rankings: { upserted: number; removed: number };
      }
    >;
  },
});
