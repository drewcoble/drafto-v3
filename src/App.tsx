import { useState } from "react";
import { Container, Title, Stack } from "@mantine/core";
import { PositionTabs } from "./components/PositionTabs";
import { ProjectionsTable } from "./components/ProjectionsTable";
import { ScraperPanel } from "./components/ScraperPanel";
import type { TabValue } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabValue>("QB");
  const week = "draft";

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Title order={2}>Fantasy Football Projections</Title>
        <PositionTabs value={activeTab} onChange={setActiveTab} />
        {activeTab === "scraper" ? (
          <ScraperPanel week={week} />
        ) : (
          <ProjectionsTable position={activeTab} week={week} />
        )}
      </Stack>
    </Container>
  );
}
