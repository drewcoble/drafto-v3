import { Group, Image, Text, Title } from "@mantine/core";
import logo from "../infinidraft_v1_noBg.png";

interface AppLogoProps {
  // Keeps the wordmark visible below "sm" too - AppHeader hides it there by
  // default to make room for the league picker/mode-switch button, but
  // callers with nothing else competing for that space (AppHeader's own
  // hideLeagueControls mode, SignedOutHeader) want it shown everywhere.
  wordmarkAlwaysVisible?: boolean;
}

// The logo + "infinidraft" wordmark, shared between AppHeader and
// SignedOutHeader.tsx so the two don't drift - previously duplicated markup
// in both places.
export function AppLogo({ wordmarkAlwaysVisible = false }: AppLogoProps) {
  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
      <Image src={logo} alt="InfiniDraft" h={60} w="auto" />
      <Title
        order={2}
        c="var(--mantine-color-text)"
        // Same size on mobile as desktop, to match the 60px logo's visual
        // weight.
        fz="1.625rem"
        {...(wordmarkAlwaysVisible ? {} : { visibleFrom: "sm" })}
      >
        <Text component="span" inherit c="saddlebrown.7">
          infini
        </Text>
        draft
      </Title>
    </Group>
  );
}
