import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/draft/$leagueId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/draft/$leagueId/draft", params });
  },
});
