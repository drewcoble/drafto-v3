import { useAuthActions } from "@convex-dev/auth/react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Image,
  Menu,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  CreditCard,
  LogOut,
  Moon,
  MoreVertical,
  Plus,
  ShieldCheck,
  Sun,
  Trophy,
  Tv,
} from "lucide-react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MOBILE_HEADER_HEIGHT } from "../constants/general";
import { BILLING_LINK_ENABLED } from "../lib/featureFlags";
import logo from "../infinidraft_v1_noBg.png";
import { groupSeasonsByLeague } from "../lib/leagueGroups";
import { setStoredLeagueId } from "../lib/leagueStorage";
import { isDraftComplete } from "../lib/rosterSlots";

const NEW_LEAGUE_VALUE = "new";

// Shared top bar for both the Setup and Draft Room screens - league picker
// (+ New League), the Setup/Draft Room mode switch, and sign out. Reads
// which league/section is current from the URL rather than local state.
//
// TV Board (draft room only)/theme toggle/sign out all collapse into one
// overflow menu at every breakpoint, rather than spreading across inline
// buttons on desktop - keeps the bar from getting crowded as more
// draft-room-only actions get added. The league picker is the same
// button-triggered menu at every breakpoint too, just narrower on mobile
// (name still truncates rather than disappearing, so which league is
// selected stays legible at a glance).
//
// Also fixed to the top of the viewport on mobile (native-app-style) rather
// than scrolling away with the page - callers must reserve
// MOBILE_HEADER_HEIGHT of top padding on mobile so page content doesn't
// start out hidden underneath it (see setup/draft route layouts).
export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leagueId } = useParams({ strict: false });
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.getCurrentUser);
  const seasonsList = useQuery(api.leagues.listSeasons, {});
  const entitlement = useQuery(api.billing.queries.getMyEntitlement);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const inDraftRoom = location.pathname.startsWith("/draft");
  const inSeason = location.pathname.startsWith("/season");
  const hasRealLeague = !!leagueId && leagueId !== NEW_LEAGUE_VALUE;
  const isDark = colorScheme === "dark";
  const selectedLeague = seasonsList?.find((l) => l._id === leagueId);
  // The picker shows one entry per real-world league, not one per year -
  // group the flat seasons list (see leagues.listSeasons) by leagueId and
  // surface only the most recent season of each so "New League" duplicates
  // from prior-season imports/rollovers don't clutter the dropdown.
  const leagueGroups = useMemo(
    () => groupSeasonsByLeague(seasonsList ?? []),
    [seasonsList],
  );
  // "Enter Season" only ever makes sense once every roster slot, league-wide,
  // has been filled - see isDraftComplete's comment. Skipped entirely
  // (rather than shown disabled) while not viewing a real league, so this
  // query doesn't fire for the "new league" placeholder route.
  const picks = useQuery(
    api.draft.picks.listDraftPicks,
    hasRealLeague ? { seasonId: leagueId as Id<"seasons"> } : "skip",
  );
  const draftComplete =
    !!selectedLeague &&
    !!picks &&
    isDraftComplete(
      selectedLeague.rosterSlots,
      selectedLeague.teamCount,
      picks.length,
    );

  const handleLeagueChange = (value: string | null) => {
    if (!value) return;
    if (value === NEW_LEAGUE_VALUE) {
      void navigate({
        to: "/setup/$leagueId/league",
        params: { leagueId: NEW_LEAGUE_VALUE },
      });
      return;
    }
    if (currentUser) {
      setStoredLeagueId(currentUser._id, value);
    }
    void navigate({
      to: ".",
      params: (prev) => ({ ...prev, leagueId: value }),
    });
  };

  const leagueMenuItems = (
    <>
      {leagueGroups.map(({ latest, seasons }) => (
        <Menu.Item
          key={latest.leagueId}
          leftSection={
            seasons.some((s) => s._id === leagueId) ? <Check size={16} /> : null
          }
          onClick={() => handleLeagueChange(latest._id)}
        >
          {latest.name}
        </Menu.Item>
      ))}
      <Menu.Divider />
      <Menu.Item
        leftSection={<Plus size={16} />}
        onClick={() => handleLeagueChange(NEW_LEAGUE_VALUE)}
      >
        New League
      </Menu.Item>
    </>
  );

  const modeSwitchButton =
    inDraftRoom || inSeason ? (
      <Link
        to="/setup/$leagueId/league"
        params={{ leagueId: leagueId ?? NEW_LEAGUE_VALUE }}
      >
        <Button component="span" variant="light" size="sm" color="burlywood">
          <Text hiddenFrom="sm" component="span" inherit>
            Setup
          </Text>
          <Text visibleFrom="sm" component="span" inherit>
            Back to Setup
          </Text>
        </Button>
      </Link>
    ) : (
      <Group gap="xs" wrap="nowrap">
        {leagueId && leagueId !== NEW_LEAGUE_VALUE ? (
          <Link to="/draft/$leagueId/draft" params={{ leagueId }}>
            <Button
              component="span"
              variant="filled"
              size="sm"
              color="saddlebrown.8"
            >
              <Text hiddenFrom="sm" component="span" inherit>
                Draft
              </Text>
              <Text visibleFrom="sm" component="span" inherit>
                Enter Draft Room
              </Text>
            </Button>
          </Link>
        ) : (
          <Button variant="filled" size="sm" disabled>
            <Text hiddenFrom="sm" component="span" inherit>
              Draft
            </Text>
            <Text visibleFrom="sm" component="span" inherit>
              Enter Draft Room
            </Text>
          </Button>
        )}
        {draftComplete && leagueId && (
          <Link to="/season/$leagueId/freeAgents" params={{ leagueId }}>
            <Button component="span" variant="filled" size="sm" color="green.8">
              <Text hiddenFrom="sm" component="span" inherit>
                Season
              </Text>
              <Text visibleFrom="sm" component="span" inherit>
                Enter Season
              </Text>
            </Button>
          </Link>
        )}
      </Group>
    );

  return (
    <Box
      pos={{ base: "fixed", sm: "static" }}
      top={0}
      left={0}
      right={0}
      px={{ base: "md", sm: 0 }}
      py={{ base: "sm", sm: "xs" }}
      h={{ base: MOBILE_HEADER_HEIGHT, sm: "auto" }}
      style={{
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group
        justify="space-between"
        align="center"
        wrap="nowrap"
        gap="xs"
        style={{ flex: 1, minWidth: 0 }}
      >
        <Link to="/" style={{ flexShrink: 0, textDecoration: "none" }}>
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <Image src={logo} alt="InfiniDraft" h={60} w="auto" />
            <Title
              order={2}
              c="var(--mantine-color-text)"
              fz={{ base: "1.125rem", sm: "1.625rem" }}
              visibleFrom="sm"
            >
              <Text component="span" inherit c="saddlebrown.7">
                infini
              </Text>
              draft
            </Title>
          </Group>
        </Link>
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          <Menu position="bottom-end" withArrow offset={8} width={220}>
            <Menu.Target>
              <Button
                variant="default"
                size="sm"
                w={{ base: 130, sm: 220 }}
                justify="space-between"
                rightSection={<ChevronDown size={16} />}
              >
                <Text truncate span>
                  {selectedLeague ? selectedLeague.name : "Select league"}
                </Text>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>{leagueMenuItems}</Menu.Dropdown>
          </Menu>
          {modeSwitchButton}
          <Menu position="bottom-end" withArrow offset={8}>
            <Menu.Target>
              <ActionIcon variant="default" size={40} aria-label="More options">
                <MoreVertical size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {inDraftRoom && hasRealLeague && (
                <Link
                  to="/board/$leagueId"
                  params={{ leagueId }}
                  target="_blank"
                >
                  <Menu.Item component="span" leftSection={<Tv size={16} />}>
                    TV Board
                  </Menu.Item>
                </Link>
              )}
              {BILLING_LINK_ENABLED && (
                <Link to="/billing">
                  <Menu.Item
                    component="span"
                    leftSection={
                      entitlement?.hasProAccess ? (
                        <CreditCard size={16} />
                      ) : (
                        <Trophy size={16} />
                      )
                    }
                  >
                    {entitlement?.hasProAccess ? "Billing" : "Go Pro"}
                  </Menu.Item>
                </Link>
              )}
              {currentUser?.role === "super-admin" && (
                <Link to="/admin">
                  <Menu.Item
                    component="span"
                    leftSection={<ShieldCheck size={16} />}
                  >
                    Admin
                  </Menu.Item>
                </Link>
              )}
              <Menu.Item
                leftSection={isDark ? <Sun size={16} /> : <Moon size={16} />}
                onClick={() => setColorScheme(isDark ? "light" : "dark")}
              >
                {isDark ? "Light mode" : "Dark mode"}
              </Menu.Item>
              <Menu.Item
                leftSection={<LogOut size={16} />}
                onClick={() => {
                  void signOut();
                  // Otherwise the next sign-in (possibly a different
                  // account on this browser) re-renders whatever league
                  // route was still in the address bar, which fails that
                  // owner check as "not authorized" if it belonged to
                  // whoever was signed in before.
                  void navigate({ to: "/", replace: true });
                }}
              >
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Box>
  );
}
