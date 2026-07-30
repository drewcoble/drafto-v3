import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/setup/$leagueId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/setup/$leagueId/league", params });
  },
});
