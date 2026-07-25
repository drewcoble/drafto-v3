import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { positionValidator, POSITIONS } from "../positions";
import {
  currentSeason,
  fetchFantasyPros,
  POSITION_SLUGS,
  requireSuperAdmin,
} from "./client";

const scoringValidator = v.union(
  v.literal("STD"),
  v.literal("PPR"),
  v.literal("HALF"),
);

interface FantasyProsPlayerPointsPlayer {
  player_id: number;
  position_id: "QB" | "RB" | "WR" | "TE" | "DST";
  weeks?: Record<string, number>;
}

interface FantasyProsPlayerPointsResponse {
  season?: string;
  players?: FantasyProsPlayerPointsPlayer[];
}

export const fetchPlayerPoints = action({
  args: {
    position: positionValidator,
    scoring: scoringValidator,
    year: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; updated: number }> => {
    await requireSuperAdmin(ctx);

    const year = args.year ?? currentSeason();

    const data: FantasyProsPlayerPointsResponse = await fetchFantasyPros(
      `/nfl/${year}/player-points`,
      {
        position: POSITION_SLUGS[args.position],
        scoring: args.scoring,
      },
    );

    const players = data.players ?? [];
    // Unlike projections/players, an empty result here is expected (not an
    // error) before the season has any played games - just no-op.
    if (players.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const rows = players.flatMap((player) =>
      Object.entries(player.weeks ?? {}).map(([week, points]) => ({
        fpid: player.player_id,
        position: player.position_id,
        week,
        points,
      })),
    );

    return await ctx.runMutation(api.playerPoints.upsertPlayerPoints, {
      season: data.season ?? year,
      scoring: args.scoring,
      rows,
    });
  },
});

export const fetchAllPlayerPoints = action({
  args: {
    scoring: scoringValidator,
    year: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireSuperAdmin(ctx);

    for (const position of POSITIONS) {
      await ctx.runAction(api.fantasyPros.playerPoints.fetchPlayerPoints, {
        position,
        scoring: args.scoring,
        ...(args.year ? { year: args.year } : {}),
      });
    }
  },
});
