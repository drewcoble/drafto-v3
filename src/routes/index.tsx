import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Center, Loader } from "@mantine/core";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getStoredLeagueId } from "../lib/leagueStorage";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

// Resolves the same way App.tsx used to before routing existed: keep the
// current selection if still valid (not applicable here, this is the very
// first navigation), else the last one this user picked (localStorage),
// else their first league, else "new" (no leagues exist yet).
function IndexRedirect() {
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);
  const draftSettingsList = useQuery(api.draftSettings.listDraftSettings, {});

  useEffect(() => {
    if (!currentUser || !draftSettingsList) return;
    const validIds = new Set(draftSettingsList.map((league) => league._id));
    const stored = getStoredLeagueId(currentUser._id);
    const leagueId: Id<"draftSettings"> | "new" =
      stored && validIds.has(stored as Id<"draftSettings">)
        ? (stored as Id<"draftSettings">)
        : (draftSettingsList[0]?._id ?? "new");
    void navigate({
      to: "/setup/$leagueId/league",
      params: { leagueId },
      replace: true,
    });
  }, [currentUser, draftSettingsList, navigate]);

  return (
    <Center py="xl">
      <Loader />
    </Center>
  );
}
