import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Center, Loader } from "@mantine/core";
import { api } from "../../../../convex/_generated/api";
import { DataPanel } from "../../../pages/Settings/DataPanel";
import { WEEK } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId/data")({
  component: DataRoute,
});

// The Data tab is hidden from non-super-admins in NavTabs, but that only
// keeps them from clicking into it - this catches direct navigation (a
// bookmarked/typed URL) so the fetch UI itself is still never shown to
// anyone who shouldn't see it, not just disabled.
function DataRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isSuperAdmin = currentUser?.role === "super-admin";

  useEffect(() => {
    if (currentUser !== undefined && !isSuperAdmin) {
      void navigate({
        to: "/setup/$leagueId/league",
        params: { leagueId },
        replace: true,
      });
    }
  }, [currentUser, isSuperAdmin, leagueId, navigate]);

  if (!isSuperAdmin) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return <DataPanel week={WEEK} />;
}
