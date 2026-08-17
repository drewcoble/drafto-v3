import { Fragment } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Ban, ChevronDown, ChevronUp, StickyNote, Target } from "lucide-react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PlayerTag, ScoringConfig, ValueGap } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { injuryColor } from "../../../lib/playerFormatting";
import { pointsForScoringConfig } from "../../../lib/relevantPlayers";
import type { ConsistencyLabel } from "../../../lib/consistency";
import { playerTagStyle } from "../../../lib/playerTagStyle";
import { ConsistencyIcon } from "./ConsistencyIcon";
import { ValueGapIcon } from "./ValueGapIcon";
import { RookieBadge } from "../../../components/RookieBadge";

// One player's keeper status for the pre-draft rankings' Keeper column - the
// actual price/streak entered on the Keepers tab (see KeepersTab.tsx's
// addKeeper) for this player's current-season keeper pick, not a projected
// cost. See PlayersTable.tsx's keeperInfoByFpid.
export interface KeeperInfo {
  price: number;
  // Consecutive seasons kept, including this one - undefined defaults to 1
  // wherever read, same convention as the draftPicks.keeperStreak field.
  streak: number | undefined;
}

interface PlayerRowProps {
  row: Doc<"projections">;
  index: number;
  scoringConfig: ScoringConfig;
  injury: { status: string; statusShort: string } | undefined;
  isRookie: boolean;
  latestNews: { title: string; publishedAt: number } | undefined;
  draftValue: { dollarValue: number; usedFallback: boolean } | undefined;
  valueGap: ValueGap | undefined;
  showValueColumn: boolean;
  tag: PlayerTag | undefined;
  onCycleTag: (() => void) | undefined;
  onSelectPlayer: (fpid: number) => void;
  consistency: ConsistencyLabel | undefined;
  showConsistencyColumn: boolean;
  keeperInfo: KeeperInfo | undefined;
  showKeeperColumn: boolean;
  showKeeperYear: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function PlayerRow({
  row,
  index,
  scoringConfig,
  injury,
  isRookie,
  latestNews,
  draftValue,
  valueGap,
  showValueColumn,
  tag,
  onCycleTag,
  onSelectPlayer,
  consistency,
  showConsistencyColumn,
  keeperInfo,
  showKeeperColumn,
  showKeeperYear,
  isExpanded,
  onToggleExpand,
}: PlayerRowProps) {
  // Rank, flags, Player, Pos, Team, FPTS, chevron, plus $ when shown - kept
  // in sync with the header column count in PlayersTable.tsx so the
  // expanded detail row's colSpan always spans the full table width.
  const colSpan = 7 + (showValueColumn ? 1 : 0);

  return (
    <Fragment>
      {/* Target/Avoid toggle and Keeper moved into an expandable detail row
        below instead of two more columns - those pushed this table well
        past mobile widths, same tradeoff InjuryReport.tsx made. */}
      <Table.Tr onClick={onToggleExpand} style={{ cursor: "pointer" }}>
        <Table.Td>{index + 1}</Table.Td>
        <Table.Td>
          <Group gap={4} wrap="nowrap">
            <Box w={28} style={{ display: "flex", justifyContent: "center" }}>
              {valueGap && (
                <ValueGapIcon valueGap={valueGap} position={row.position} />
              )}
            </Box>
            {showConsistencyColumn && consistency && (
              <ConsistencyIcon label={consistency} />
            )}
          </Group>
        </Table.Td>
        <Table.Td miw={220}>
          <Group gap={6}>
            <Anchor
              component="button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectPlayer(row.fpid);
              }}
            >
              {row.name}
            </Anchor>
            {isRookie && <RookieBadge />}
            {injury && (
              <Badge
                color={injuryColor(injury.status)}
                size="sm"
                variant="light"
              >
                {injury.statusShort}
              </Badge>
            )}
            {latestNews && (
              <Tooltip label={latestNews.title} multiline w={260} withArrow>
                <StickyNote
                  size={14}
                  strokeWidth={2}
                  aria-label="Recent news"
                />
              </Tooltip>
            )}
          </Group>
        </Table.Td>
        <Table.Td miw={70}>
          <Badge color={POSITION_COLORS[row.position]} variant="light">
            {row.position}
          </Badge>
        </Table.Td>
        <Table.Td>{row.team ?? "—"}</Table.Td>
        <Table.Td>
          {pointsForScoringConfig(row, scoringConfig).toFixed(1)}
        </Table.Td>
        {showValueColumn && (
          <Table.Td>
            {draftValue ? (
              draftValue.usedFallback ? (
                <Tooltip
                  label="Approximate: this position's replacement-level player isn't in our data yet, so this uses a fallback estimate"
                  multiline
                  w={260}
                  withArrow
                >
                  <Text span fs="italic" c="dimmed">
                    ${Math.round(draftValue.dollarValue)}
                  </Text>
                </Tooltip>
              ) : (
                `$${Math.round(draftValue.dollarValue)}`
              )
            ) : (
              "—"
            )}
          </Table.Td>
        )}
        <Table.Td>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={isExpanded ? "Hide details" : "Show details"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </ActionIcon>
        </Table.Td>
      </Table.Tr>
      {isExpanded && (
        <Table.Tr>
          <Table.Td colSpan={colSpan}>
            <SimpleGrid cols={2} spacing="md" py={4}>
              <Stack gap={4}>
                <Group gap={6}>
                  <Tooltip
                    label={
                      !onCycleTag
                        ? "Select a league to mark targets/avoids"
                        : tag === "target"
                          ? "Target - click to mark avoid"
                          : tag === "avoid"
                            ? "Avoid - click to clear"
                            : "Click to mark as target"
                    }
                  >
                    <ActionIcon
                      size={36}
                      disabled={!onCycleTag}
                      onClick={onCycleTag}
                      aria-label="Cycle target/avoid"
                      {...(tag
                        ? playerTagStyle(tag)
                        : { variant: "subtle", color: "gray" })}
                    >
                      {tag === "avoid" ? (
                        <Ban size={16} />
                      ) : (
                        <Target size={16} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                  <Text size="xs">
                    {tag === "target"
                      ? "Target"
                      : tag === "avoid"
                        ? "Avoid"
                        : "Not tagged"}
                  </Text>
                </Group>
              </Stack>
              {showKeeperColumn && (
                <Stack gap={4}>
                  <Group gap={6}>
                    <Text size="xs" fw={600} c="dimmed">
                      Keeper:
                    </Text>
                    <Text size="xs">
                      {keeperInfo
                        ? showKeeperYear
                          ? `$${keeperInfo.price} · Yr ${keeperInfo.streak ?? 1}`
                          : `$${keeperInfo.price}`
                        : "—"}
                    </Text>
                  </Group>
                </Stack>
              )}
            </SimpleGrid>
          </Table.Td>
        </Table.Tr>
      )}
    </Fragment>
  );
}
