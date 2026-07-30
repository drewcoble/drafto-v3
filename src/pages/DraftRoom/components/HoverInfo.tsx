import { Button, Stack, Text } from "@mantine/core";
import { DraftBoardRow, PlayerTag, ValueGap } from "../../../types";
import { PlanSlotMatch } from "../../../lib/planRecommendation";
import { consistencyColor, ConsistencyLabel } from "../../../lib/consistency";

const HoverInfo = ({
  row,
  planMatch,
  fitsBudget,
  consistency,
  valueGap,
  tag,
  handleClick,
}: {
  row: DraftBoardRow;
  planMatch?: PlanSlotMatch | undefined;
  fitsBudget: boolean;
  consistency?: ConsistencyLabel | undefined;
  valueGap?: ValueGap | undefined;
  tag?: PlayerTag | undefined;
  handleClick: () => void;
}) => {
  return (
    <Stack>
      <Button variant="subtle" size="sm" onClick={handleClick} w="content">
        {row.name}
        {row.team ? ` · ${row.team}` : ""}
      </Button>
      <Text size="xs">
        {row.position}
        {row.positionRank} · {row.tierLabel}
      </Text>
      <Text size="xs">
        ${Math.round(row.dollarValue)} proj · {row.points.toFixed(1)} pts
      </Text>
      {planMatch && (
        <Text size="xs" c={!fitsBudget ? "orange.6" : "inherit"}>
          {planMatch.slotLabel} budget: ${Math.round(planMatch.amount)}
        </Text>
      )}
      {consistency && (
        <Text size="xs" c={`${consistencyColor(consistency)}.6`}>
          {consistency}
        </Text>
      )}
      {valueGap && (
        <Text size="xs" maw={250}>
          {valueGap.direction === "undervalued"
            ? "⭐ Undervalued"
            : valueGap.direction === "breakout"
              ? "🚀 Breakout"
              : valueGap.direction === "falloff"
                ? "❄️ Fall Off"
                : "📉 Overvalued"}
          {" - "}
          Last year: {valueGap.lastYearPpg.toFixed(1)} ppg ({row.position}
          {valueGap.lastYearRank}) · This year proj {row.position}
          {valueGap.projRank} · ADP {row.position}
          {valueGap.adpRank}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {tag === "target" && "Target - click to mark avoid"}
        {tag === "avoid" && "Avoid - click to clear"}
        {!tag && "Click to mark as target"}
      </Text>
    </Stack>
  );
};

export default HoverInfo;
