import { Box, Menu, Stack, Text, UnstyledButton } from "@mantine/core";
import { Link, useLocation } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BottomNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
  to: string;
};

type BottomNavMore = {
  label: string;
  items: readonly BottomNavItem[];
};

type BottomNavProps = {
  items: readonly BottomNavItem[];
  more?: BottomNavMore;
  leagueId: string;
  // Reserves the center notch for the nominate FAB (see MobileNomination) -
  // only the Draft Room layout has one; Setup has no FAB, so it renders one
  // flat evenly-spaced row instead of splitting around an empty gap.
  hasFab?: boolean;
};

// `to` is a plain `string` on BottomNavItem (items come from a shared,
// already route-checked TABS array - see NavTabs.tsx / draft route.tsx),
// not a literal, so TanStack Router's Link can't resolve which params
// shape applies to it at this generic call site. The route paths
// themselves are still type-checked at their point of definition via the
// equivalent desktop <Tabs.Tab renderRoot> Link usage in those same files.
function linkPropsFor(to: string, leagueId: string) {
  return { to, params: { leagueId } } as { to: "/" };
}

// Width of the empty center notch reserved for the nominate FAB (see
// MobileNomination, a fixed 56px circle centered on the same axis) - wide
// enough that the FAB's shadow/border doesn't crowd the flanking buttons.
const FAB_GAP_WIDTH = 72;

// Mobile-only tab bar, fixed to the bottom of the viewport (hidden at the
// "sm" breakpoint and up, where the top Tabs take over instead). Floats
// above the bottom edge as a rounded, elevated bar rather than sitting
// flush with the screen. Pairs with the extra bottom padding added to the
// page Container in the setup/draft layouts so this doesn't cover the
// last bit of scrollable content.
//
// Renders as two flex groups with an empty gap between them (rather than
// one flat row) so the nominate FAB - fixed-positioned and horizontally
// centered independently in MobileNomination - has a dedicated notch to
// float in instead of landing on top of whichever button happened to sit
// in the dead center of an evenly-spaced row.
export function BottomNav({
  items,
  more,
  leagueId,
  hasFab = false,
}: BottomNavProps) {
  const location = useLocation();
  const activeValue = location.pathname.split("/").pop();
  const moreActive = more?.items.some((item) => item.value === activeValue);

  function renderItem(item: BottomNavItem) {
    const Icon = item.icon;
    const active = item.value === activeValue;
    return (
      <Link
        key={item.value}
        {...linkPropsFor(item.to, leagueId)}
        style={{ flex: 1, textDecoration: "none", color: "inherit" }}
      >
        <Stack gap={2} align="center" py={12} c={active ? "burlywood" : "dimmed"}>
          <Icon size={20} strokeWidth={active ? 2.5 : 2} />
          <Text fz={10} fw={active ? 600 : 400} lh={1}>
            {item.label}
          </Text>
        </Stack>
      </Link>
    );
  }

  const moreButton = more && (
    <Menu key="more" position="top-end" withArrow offset={8} width={180}>
      <Menu.Target>
        <UnstyledButton style={{ flex: 1 }}>
          <Stack
            gap={2}
            align="center"
            py={12}
            c={moreActive ? "burlywood" : "dimmed"}
          >
            <MoreHorizontal size={20} strokeWidth={moreActive ? 2.5 : 2} />
            <Text fz={10} fw={moreActive ? 600 : 400} lh={1}>
              {more.label}
            </Text>
          </Stack>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {more.items.map((item) => {
          const Icon = item.icon;
          const active = item.value === activeValue;
          return (
            <Menu.Item
              key={item.value}
              component={Link}
              {...linkPropsFor(item.to, leagueId)}
              leftSection={<Icon size={16} />}
              fw={active ? 600 : 400}
              c={active ? "burlywood" : "dimmed"}
            >
              {item.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );

  const buttons = [...items.map(renderItem), moreButton];
  const leftButtons = hasFab
    ? buttons.slice(0, Math.ceil(buttons.length / 2))
    : buttons;
  const rightButtons = hasFab
    ? buttons.slice(Math.ceil(buttons.length / 2))
    : [];

  return (
    <Box
      hiddenFrom="sm"
      pos="fixed"
      left={12}
      right={12}
      style={{
        bottom: "calc(2px + env(safe-area-inset-bottom))",
        zIndex: 200,
        display: "flex",
        maxWidth: 480,
        margin: "0 auto",
        borderRadius: "var(--mantine-radius-xl)",
        border: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
        boxShadow: "var(--mantine-shadow-lg)",
        overflow: "hidden",
      }}
    >
      {leftButtons}
      {hasFab && <Box style={{ width: FAB_GAP_WIDTH, flexShrink: 0 }} />}
      {rightButtons}
    </Box>
  );
}
