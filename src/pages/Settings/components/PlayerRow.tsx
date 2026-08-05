import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Group,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Ban, StickyNote, Target } from "lucide-react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PlayerTag, ScoringFormat, ValueGap } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { injuryColor } from "../../../lib/playerFormatting";
import { pointsForScoring } from "../../../lib/relevantPlayers";
import type { ConsistencyLabel } from "../../../lib/consistency";
import { ConsistencyIcon } from "./ConsistencyIcon";
import { ValueGapIcon } from "./ValueGapIcon";

// One player's keeper status for the pre-draft rankings' Keeper column -
// see src/lib/keeperCost.ts and PlayersTable.tsx's keeperInfoByFpid.
export interface KeeperInfo {
  // Consecutive seasons already kept (0 if never kept, or if last kept
  // non-consecutively).
  timesKept: number;
  // Suggested keeper cost if kept again this season, or null when there's
  // nothing to suggest (no prior price and no undraftedCost rule) or the
  // player is ineligible (team keeper cap or consecutive-year cap reached).
  value: number | null;
}

interface PlayerRowProps {
  row: Doc<"projections">;
  index: number;
  scoring: ScoringFormat;
  injury: { status: string; statusShort: string } | undefined;
  latestNews: { title: string; publishedAt: number } | undefined;
  draftValue: { dollarValue: number; usedFallback: boolean } | undefined;
  valueGap: ValueGap | undefined;
  showValueColumn: boolean;
  statKeys: string[];
  tag: PlayerTag | undefined;
  onCycleTag: (() => void) | undefined;
  onSelectPlayer: (fpid: number) => void;
  consistency: ConsistencyLabel | undefined;
  showConsistencyColumn: boolean;
  keeperInfo: KeeperInfo | undefined;
  showKeeperColumn: boolean;
}

export function PlayerRow({
  row,
  index,
  scoring,
  injury,
  latestNews,
  draftValue,
  valueGap,
  showValueColumn,
  statKeys,
  tag,
  onCycleTag,
  onSelectPlayer,
  consistency,
  showConsistencyColumn,
  keeperInfo,
  showKeeperColumn,
}: PlayerRowProps) {
  return (
    <Table.Tr>
      <Table.Td>{index + 1}</Table.Td>
      <Table.Td>
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
            variant={tag ? "light" : "subtle"}
            size={40}
            color={tag === "target" ? "green" : tag === "avoid" ? "red" : "gray"}
            disabled={!onCycleTag}
            onClick={onCycleTag}
            aria-label="Cycle target/avoid"
          >
            {tag === "avoid" ? <Ban size={16} /> : <Target size={16} />}
          </ActionIcon>
        </Tooltip>
      </Table.Td>
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
            onClick={() => onSelectPlayer(row.fpid)}
          >
            {row.name}
          </Anchor>
          {injury && (
            <Badge color={injuryColor(injury.status)} size="sm" variant="light">
              {injury.statusShort}
            </Badge>
          )}
          {latestNews && (
            <Tooltip label={latestNews.title} multiline w={260} withArrow>
              <StickyNote size={14} strokeWidth={2} aria-label="Recent news" />
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
      <Table.Td>{pointsForScoring(row, scoring).toFixed(1)}</Table.Td>
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
      {showKeeperColumn && (
        <Table.Td>
          {keeperInfo && keeperInfo.value !== null ? (
            `${keeperInfo.timesKept}× · $${keeperInfo.value}`
          ) : keeperInfo && keeperInfo.timesKept > 0 ? (
            `${keeperInfo.timesKept}× · -`
          ) : (
            "—"
          )}
        </Table.Td>
      )}
      {statKeys.map((key) => (
        <Table.Td key={key}>{row.stats[key] ?? "—"}</Table.Td>
      ))}
    </Table.Tr>
  );
}
