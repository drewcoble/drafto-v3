import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { fetchFantasyPros, parseUtcDateTime, requireSuperAdmin } from "./client";

interface FantasyProsNewsItem {
  id: number;
  created: string; // "2026-06-24 15:30:14", UTC, no offset in the string
  author: string;
  player_id: number;
  team_id: string;
  title: string;
  categories?: string[];
  link: string;
  desc: string;
  impact: string;
}

interface FantasyProsNewsResponse {
  items?: FantasyProsNewsItem[];
}

export const fetchNews = action({
  args: {},
  handler: async (ctx): Promise<{ inserted: number; updated: number }> => {
    await requireSuperAdmin(ctx);

    const data: FantasyProsNewsResponse = await fetchFantasyPros(
      "/nfl/news",
      {},
    );

    const items = data.items ?? [];

    return await ctx.runMutation(api.news.upsertNews, {
      rows: items.map((item) => ({
        newsId: item.id,
        fpid: item.player_id,
        team: item.team_id,
        title: item.title,
        description: item.desc,
        impact: item.impact,
        categories: item.categories ?? [],
        link: item.link,
        author: item.author,
        publishedAt: parseUtcDateTime(item.created),
      })),
    });
  },
});
