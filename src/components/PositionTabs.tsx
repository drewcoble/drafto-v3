import { Tabs } from "@mantine/core";
import { POSITIONS, type Position, type TabValue } from "../types";

interface PositionTabsProps {
  value: TabValue;
  onChange: (tab: TabValue) => void;
  showScraperTab: boolean;
}

export function PositionTabs({
  value,
  onChange,
  showScraperTab,
}: PositionTabsProps) {
  return (
    <Tabs
      value={value}
      onChange={(next) => {
        if (next === "scraper") {
          onChange(next);
          return;
        }

        if (next !== null && (POSITIONS as readonly string[]).includes(next)) {
          onChange(next as Position);
        }
      }}
    >
      <Tabs.List>
        {POSITIONS.map((pos) => (
          <Tabs.Tab key={pos} value={pos}>
            {pos}
          </Tabs.Tab>
        ))}
        {showScraperTab && <Tabs.Tab value="scraper">Scraper</Tabs.Tab>}
      </Tabs.List>
    </Tabs>
  );
}
