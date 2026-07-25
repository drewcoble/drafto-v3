import { Tabs } from "@mantine/core";
import type { TabValue } from "../types";

interface NavTabsProps {
  value: TabValue;
  onChange: (tab: TabValue) => void;
}

export function NavTabs({ value, onChange }: NavTabsProps) {
  return (
    <Tabs
      value={value}
      onChange={(next) => {
        if (next) onChange(next as TabValue);
      }}
    >
      <Tabs.List>
        <Tabs.Tab value="league">League Details</Tabs.Tab>
        <Tabs.Tab value="players">Players</Tabs.Tab>
        <Tabs.Tab value="data">Data</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}
