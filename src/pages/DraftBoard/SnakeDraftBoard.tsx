import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Center, Loader } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { WEEK } from "../../constants/general";
import { useFitScale } from "../../hooks/useFitScale";
import logo from "../../infinidraft_v1_noBg.png";
import type { Position } from "../../types";

interface SnakeDraftBoardProps {
  seasonId: Id<"seasons">;
}

// Matches the approved mockup's own palette exactly (Claude Design project
// "Infinidraft UX review", Snake Draft TV Board.dc.html) rather than the
// app's normal POSITION_COLORS/theme - this board is a standalone dark
// broadcast design, not themed Mantine content, and the theme's own `k`
// color (pink) doesn't match the mockup's neutral gray-olive K at all.
const POS_COLORS: Record<Position, string> = {
  QB: "#e0b968",
  RB: "#5aa06f",
  WR: "#5b9bd6",
  TE: "#a679d1",
  DST: "#c56a63",
  K: "#7d8079",
};

// How long the ticker bar's "JUST DRAFTED" flash holds before settling back
// to "LAST PICK" - mirrors the mockup's ANNOUNCE_SECONDS, but driven by a
// real pick actually landing (see the announcing effect below) instead of a
// simulated timer, since no live pick-clock/countdown exists server-side
// (SNAKE_DRAFT.md has no such field - a real countdown would need new
// schema/mutations, out of scope for this board).
const ANNOUNCE_MS = 5000;

const REFERENCE_TEAM_WIDTH = 160;

// Round-by-round TV board for a snake/linear draft - the round-by-round
// counterpart to DraftBoard.tsx's team-roster view (auction only makes
// sense as "who has what," a snake draft's own shape - one slot per team
// per round, in a fixed order - is much more legible as a grid). Rendered
// by DraftBoard.tsx itself once it resolves draftType, same
// /board/$leagueId public route and useFitScale "shrink everything to fit
// one screen, no scrolling" convention as its auction sibling.
export function SnakeDraftBoard({ seasonId }: SnakeDraftBoardProps) {
  const settings = useQuery(api.leagues.getSeasonPublic, { seasonId });
  const board = useQuery(api.draft.pickSlots.getSnakeBoardPublic, {
    seasonId,
  });
  const picks = useQuery(api.draft.picks.listDraftPicksPublic, { seasonId });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });

  const playerByFpid = useMemo(() => {
    const map = new Map<
      number,
      { name: string; team: string | null; position: Position }
    >();
    for (const row of allProjections ?? []) map.set(row.fpid, row);
    return map;
  }, [allProjections]);

  const lastPick = useMemo(() => {
    if (!picks || picks.length === 0) return undefined;
    return [...picks].sort((a, b) => b.sequence - a.sequence)[0];
  }, [picks]);

  // Flashes "JUST DRAFTED" for ANNOUNCE_MS whenever the most recent pick's
  // fpid actually changes - not on first load (nothing "just" happened
  // then, this viewer just opened mid-draft), only on a real transition.
  const [announcing, setAnnouncing] = useState(false);
  const lastAnnouncedFpid = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!lastPick) return;
    if (lastAnnouncedFpid.current === undefined) {
      lastAnnouncedFpid.current = lastPick.fpid;
      return;
    }
    if (lastPick.fpid !== lastAnnouncedFpid.current) {
      lastAnnouncedFpid.current = lastPick.fpid;
      setAnnouncing(true);
      const timer = setTimeout(() => setAnnouncing(false), ANNOUNCE_MS);
      return () => clearTimeout(timer);
    }
  }, [lastPick]);

  const { containerRef, contentRef, scale, contentWidth } = useFitScale();

  // The footer is rendered fixed to the real viewport bottom (see below)
  // instead of inside the scaled `contentRef` column, so its "UP NEXT"/color
  // key text stays a fixed, readable size on a TV instead of shrinking along
  // with everything else. That means the fit-to-screen container above it
  // needs its height reduced by exactly the footer's own (unscaled) height,
  // or the scaled board content would render underneath the fixed footer.
  const [footerNode, setFooterNode] = useState<HTMLDivElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const footerRef = useCallback((node: HTMLDivElement | null) => {
    setFooterNode(node);
  }, []);
  useEffect(() => {
    if (!footerNode) {
      setFooterHeight(0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) setFooterHeight(height);
    });
    observer.observe(footerNode);
    return () => observer.disconnect();
  }, [footerNode]);

  // Same fixed-to-viewport treatment for the header + ticker bar, so the
  // league name/on-clock status/last-pick ticker also stay a fixed,
  // readable size pinned to the real top of the screen instead of shrinking
  // with the scaled board. The fit-to-screen container below needs its top
  // padded by this combined height so the board doesn't render underneath.
  const [topBarNode, setTopBarNode] = useState<HTMLDivElement | null>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const topBarRef = useCallback((node: HTMLDivElement | null) => {
    setTopBarNode(node);
  }, []);
  useEffect(() => {
    if (!topBarNode) {
      setTopBarHeight(0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) setTopBarHeight(height);
    });
    observer.observe(topBarNode);
    return () => observer.disconnect();
  }, [topBarNode]);

  if (!settings || board === undefined) {
    return (
      <Center h="100vh" style={{ background: "#0a0f0d" }}>
        <Loader size="lg" color="orange" />
      </Center>
    );
  }

  const teamCount = board?.teamCount ?? 0;

  const upNext = board
    ? board.rounds
        .flatMap((r) => r.cells)
        .filter(
          (c) => !c.isForfeited && c.overallPick > board.currentOverallPick,
        )
        .sort((a, b) => a.overallPick - b.overallPick)
        .slice(0, 5)
    : [];

  // Round/pick numbers stay meaningful pre-draft too (keepers already
  // claim slots), so only the LABEL changes based on whether the draft has
  // actually started - see convex/draft/pickSlots.ts's getSnakeBoardPublic.
  const onClockLabel = board?.draftComplete
    ? "Draft complete"
    : !board?.draftStarted
      ? "Draft not started"
      : "On the clock";

  return (
    <>
      {/* Header + ticker bar - fixed to the real viewport top (outside the
          scaled `contentRef` column below) so they stay a consistent,
          readable size instead of shrinking along with the rest of the
          board. */}
      <div
        ref={topBarRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "#0a0f0d",
          color: "#e7e8e5",
          fontFamily:
            '-apple-system, "Inter", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <img src={logo} alt="" style={{ height: 14, width: "auto" }} />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                <span style={{ color: "#d9803f" }}>infini</span>
                <span style={{ color: "#e7e8e5" }}>draft</span>
              </div>
            </div>
            <div
              style={{
                fontSize: 7,
                color: "#7d8079",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Snake Draft Board
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 17,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: board?.draftComplete ? "#5aa06f" : "#d9803f",
                  animation: "snakeDotBlink 1.6s ease-in-out infinite",
                }}
              />
              <span style={{ fontSize: 7, color: "#9a9d97" }}>
                {onClockLabel}
              </span>
              {board?.onClockTeamName && (
                <span style={{ fontSize: 8, fontWeight: 700 }}>
                  {board.onClockTeamName}
                </span>
              )}
            </div>
            <div
              style={{
                width: 1,
                height: 13,
                background: "rgba(255,255,255,0.1)",
              }}
            />
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 7, color: "#7d8079" }}>Round</span>
              <span style={{ fontSize: 9, fontWeight: 700 }}>
                {board ? (board.onClockRound ?? board.totalRounds) : "—"}
              </span>
              <span style={{ fontSize: 7, color: "#4d5049" }}>
                / {board?.totalRounds ?? "—"}
              </span>
              <span style={{ fontSize: 7, color: "#7d8079", marginLeft: 7 }}>
                Pick
              </span>
              <span style={{ fontSize: 9, fontWeight: 700 }}>
                {board?.currentOverallPick ?? "—"}
              </span>
              <span style={{ fontSize: 7, color: "#4d5049" }}>
                / {board?.totalPicks ?? "—"}
              </span>
            </div>
            <div
              style={{
                width: 1,
                height: 13,
                background: "rgba(255,255,255,0.1)",
              }}
            />
            <div style={{ fontSize: 9, fontWeight: 600, color: "#cfd1cd" }}>
              {settings.name}
            </div>
          </div>
        </div>

        {/* Ticker bar - last/just-drafted pick */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "6px 14px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            boxSizing: "border-box",
            height: 37,
            background: announcing
              ? "linear-gradient(90deg, rgba(90,160,111,0.18), rgba(90,160,111,0.04) 55%, transparent)"
              : "rgba(255,255,255,0.015)",
            borderLeft: `2px solid ${announcing ? "#5aa06f" : "rgba(255,255,255,0.09)"}`,
            animation: announcing ? "snakeTickerIn 0.45s ease-out" : undefined,
          }}
        >
          <div
            style={{
              fontSize: 6,
              fontWeight: 700,
              letterSpacing: "0.18em",
              width: 64,
              flexShrink: 0,
              color: announcing ? "#5aa06f" : "#4d5049",
              animation: announcing
                ? "snakeDotBlink 1s ease-in-out infinite"
                : undefined,
            }}
          >
            {announcing ? "JUST DRAFTED" : "LAST PICK"}
          </div>
          {lastPick ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 7,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 6,
                    color: "#7d8079",
                    letterSpacing: "0.06em",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lastPick.round !== undefined &&
                  lastPick.pickInRound !== undefined
                    ? `${lastPick.round}.${String(lastPick.pickInRound).padStart(2, "0")}  ·  PICK #${lastPick.overallPick ?? ""}`
                    : ""}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#cfd1cd",
                    whiteSpace: "nowrap",
                  }}
                >
                  {board?.rounds
                    .flatMap((r) => r.cells)
                    .find((c) => c.pick?.fpid === lastPick.fpid)
                    ?.currentTeamName ?? ""}
                </span>
              </div>
              <div
                style={{
                  width: 1,
                  height: 15,
                  background: "rgba(255,255,255,0.1)",
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: announcing ? 14 : 11,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    color: announcing ? "#ffffff" : "#9a9d97",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transition: "font-size 0.25s ease, color 0.25s ease",
                  }}
                >
                  {playerByFpid.get(lastPick.fpid)?.name ?? `#${lastPick.fpid}`}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: POS_COLORS[lastPick.position],
                    background: `${POS_COLORS[lastPick.position]}24`,
                    border: `1px solid ${POS_COLORS[lastPick.position]}55`,
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                >
                  {lastPick.position}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    color: "#7d8079",
                    letterSpacing: "0.04em",
                  }}
                >
                  {playerByFpid.get(lastPick.fpid)?.team ?? ""}
                </span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 8, color: "#4d5049" }}>No picks yet</span>
          )}
        </div>
      </div>

      <Box
        ref={containerRef}
        style={{
          width: "100vw",
          height: `calc(100vh - ${topBarHeight}px - ${footerHeight}px)`,
          marginTop: topBarHeight,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f0d",
        }}
      >
        <style>{`
        @keyframes snakeOnClockPulse { 0%,100% { box-shadow: 0 0 0 1px #d9803f, 0 0 18px rgba(217,128,63,0.25); } 50% { box-shadow: 0 0 0 1px #d9803f, 0 0 32px rgba(217,128,63,0.55); } }
        @keyframes snakeDotBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes snakeLandFlash { 0% { background: rgba(90,160,111,0.32); } 100% { background: rgba(90,160,111,0.10); } }
        @keyframes snakeTickerIn { 0% { opacity: 0; transform: translateY(-8px); } 100% { opacity: 1; transform: translateY(0); } }
      `}</style>
        <Box
          ref={contentRef}
          style={{
            width: contentWidth ?? teamCount * REFERENCE_TEAM_WIDTH + 200,
            flexShrink: 0,
            transform: `scale(${scale})`,
            background: "#0a0f0d",
            color: "#e7e8e5",
            fontFamily:
              '-apple-system, "Inter", "Helvetica Neue", Arial, sans-serif',
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Board body */}
          <div style={{ flex: 1, minHeight: 0, padding: "14px 20px" }}>
            {!board ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#7d8079",
                  fontSize: 18,
                }}
              >
                Set the draft order before the board can show anything.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Team header row */}
                <div style={{ display: "flex", padding: "0 0 10px" }}>
                  <div style={{ width: 74, flexShrink: 0 }} />
                  {board.teamOrder.map((teamId) => {
                    const isOnClock = board.onClockTeamId === teamId;
                    return (
                      <div
                        key={teamId}
                        style={{
                          flex: 1,
                          minWidth: 152,
                          margin: "0 3px",
                          padding: "8px 9px",
                          borderRadius: 8,
                          boxSizing: "border-box",
                          background: isOnClock
                            ? "rgba(217,128,63,0.1)"
                            : "rgba(255,255,255,0.025)",
                          border: `1px solid ${isOnClock ? "rgba(217,128,63,0.45)" : "rgba(255,255,255,0.07)"}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14.5,
                            fontWeight: 700,
                            color: isOnClock ? "#d9803f" : "#e7e8e5",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {board.rounds[0]?.cells.find(
                            (c) => c.originalTeamId === teamId,
                          )?.originalTeamName ?? ""}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Round rows */}
                {board.rounds.map((r) => (
                  <div
                    key={r.round}
                    style={{ display: "flex", alignItems: "stretch" }}
                  >
                    <div
                      style={{
                        width: 74,
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          color: "#4d5049",
                        }}
                      >
                        RD
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color:
                            r.round === board.onClockRound
                              ? "#d9803f"
                              : "#7d8079",
                          lineHeight: 1,
                        }}
                      >
                        {r.round}
                      </div>
                      <div
                        title={
                          r.forward
                            ? "Round order: left to right"
                            : "Round order: right to left (snake)"
                        }
                        style={{ fontSize: 12, color: "#4d5049" }}
                      >
                        {r.forward ? "→" : "←"}
                      </div>
                    </div>

                    {r.cells.map((cell) => {
                      const player = cell.pick
                        ? playerByFpid.get(cell.pick.fpid)
                        : undefined;
                      const base: React.CSSProperties = {
                        flex: 1,
                        minWidth: 152,
                        margin: "0 3px",
                        borderRadius: 8,
                        padding: "7px 9px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        boxSizing: "border-box",
                        height: 68,
                        justifyContent: "center",
                      };
                      let cellStyle: React.CSSProperties;
                      if (cell.isOnClock) {
                        cellStyle = {
                          ...base,
                          background: "rgba(217,128,63,0.12)",
                          border: "1px solid #d9803f",
                          animation:
                            "snakeOnClockPulse 1.8s ease-in-out infinite",
                        };
                      } else if (
                        cell.pick &&
                        cell.pick.fpid === lastPick?.fpid &&
                        announcing
                      ) {
                        cellStyle = {
                          ...base,
                          background: "rgba(90,160,111,0.12)",
                          border: "1px solid rgba(90,160,111,0.75)",
                          animation: "snakeLandFlash 0.9s ease-out 3",
                        };
                      } else if (cell.pick || cell.isForfeited) {
                        cellStyle = {
                          ...base,
                          background: "rgba(255,255,255,0.035)",
                          border: `1px solid ${cell.traded ? "rgba(224,185,104,0.28)" : "rgba(255,255,255,0.07)"}`,
                        };
                      } else {
                        cellStyle = {
                          ...base,
                          background: "rgba(255,255,255,0.012)",
                          border: `1px dashed ${cell.traded ? "rgba(224,185,104,0.28)" : "rgba(255,255,255,0.06)"}`,
                        };
                      }

                      const numColor = cell.isOnClock
                        ? "#d9803f"
                        : cell.pick || cell.isForfeited
                          ? "#5c5f58"
                          : "#3d403a";

                      return (
                        <div
                          key={cell.originalTeamId}
                          style={cellStyle}
                          title={
                            cell.tradeNote ??
                            (cell.traded
                              ? `Traded pick — originally ${cell.originalTeamName}'s, now owned by ${cell.currentTeamName}`
                              : undefined)
                          }
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                              flexShrink: 0,
                              height: 16,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10.5,
                                color: numColor,
                                fontVariantNumeric: "tabular-nums",
                                letterSpacing: "0.04em",
                              }}
                            >
                              {r.round}.{String(cell.position).padStart(2, "0")}{" "}
                              · #{cell.overallPick}
                            </span>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              {cell.traded && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    letterSpacing: "0.06em",
                                    color: "#e0b968",
                                    background: "rgba(224,185,104,0.14)",
                                    border: "1px solid rgba(224,185,104,0.35)",
                                    borderRadius: 4,
                                    padding: "1px 5px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  → {cell.currentTeamName}
                                </span>
                              )}
                              {cell.pick && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    letterSpacing: "0.04em",
                                    color: POS_COLORS[cell.pick.position],
                                    background: `${POS_COLORS[cell.pick.position]}1f`,
                                    borderRadius: 4,
                                    padding: "1px 5px",
                                  }}
                                >
                                  {cell.pick.position}
                                  {cell.pick.isKeeper ? " · K" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              flexShrink: 0,
                              fontSize: 13.5,
                              fontWeight: cell.isOnClock ? 700 : 600,
                              color: cell.isOnClock
                                ? "#d9803f"
                                : cell.isForfeited
                                  ? "#5c5f58"
                                  : cell.pick
                                    ? "#e7e8e5"
                                    : "#3d403a",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: "18px",
                              height: 18,
                            }}
                          >
                            {cell.isForfeited
                              ? "Forfeited"
                              : cell.pick
                                ? (player?.name ?? `#${cell.pick.fpid}`)
                                : cell.isOnClock
                                  ? "On the clock"
                                  : ""}
                          </div>
                          <div
                            style={{
                              flexShrink: 0,
                              height: 14,
                              lineHeight: "14px",
                              fontSize: 10.5,
                              color: cell.isOnClock
                                ? "rgba(217,128,63,0.75)"
                                : "#5c5f58",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {cell.isForfeited
                              ? (cell.tradeNote ?? "")
                              : cell.pick
                                ? (player?.team ?? "")
                                : cell.isOnClock
                                  ? `${cell.currentTeamName} selecting`
                                  : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Box>
      </Box>

      {/* Footer - fixed to the real viewport bottom (outside the scaled
        `contentRef` column above) so it stays a consistent, readable size
        instead of shrinking along with the rest of the board. */}
      {board && (
        <div
          ref={footerRef}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 28px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "#0d120e",
            color: "#e7e8e5",
            fontFamily:
              '-apple-system, "Inter", "Helvetica Neue", Arial, sans-serif',
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#4d5049",
                letterSpacing: "0.12em",
              }}
            >
              UP NEXT
            </div>
            {upNext.map((cell) => (
              <div
                key={`${cell.overallPick}`}
                style={{ display: "flex", alignItems: "center", gap: 9 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "#4d5049",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  #{cell.overallPick}
                </span>
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: "#cfd1cd" }}
                >
                  {cell.currentTeamName}
                </span>
                {cell.traded && (
                  <span
                    title={`Pick acquired from ${cell.originalTeamName}`}
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: "#e0b968",
                      background: "rgba(224,185,104,0.14)",
                      border: "1px solid rgba(224,185,104,0.35)",
                      borderRadius: 4,
                      padding: "1px 5px",
                    }}
                  >
                    via {cell.originalTeamName}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: "rgba(217,128,63,0.2)",
                  border: "1px solid #d9803f",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 11, color: "#7d8079" }}>
                On the clock
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: "rgba(224,185,104,0.14)",
                  border: "1px solid rgba(224,185,104,0.55)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 11, color: "#7d8079" }}>
                Traded pick
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  border: "1px dashed rgba(255,255,255,0.25)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 11, color: "#7d8079" }}>Upcoming</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
