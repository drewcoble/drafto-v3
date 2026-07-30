import { createFileRoute } from "@tanstack/react-router";
import { DataPanel } from "../../../pages/Settings/DataPanel";
import { WEEK } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId/data")({
  component: () => <DataPanel week={WEEK} />,
});
