import { useMemo, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

export function AuthPanel() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const title = useMemo(
    () => (mode === "signIn" ? "Sign in" : "Create account"),
    [mode],
  );

  const handleSubmit = async () => {
    setStatus(null);

    try {
      await signIn("password", {
        flow: mode === "signIn" ? "signIn" : "signUp",
        email,
        password,
        name: name || email,
      });
      setStatus({ kind: "success", message: `${title} succeeded.` });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed.";
      setStatus({ kind: "error", message });
    }
  };

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return (
      <Stack gap="sm">
        <Text c="dimmed">You are signed in.</Text>
        <Button variant="default" onClick={() => signOut()}>
          Sign out
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" py="sm">
      <Text fw={600}>{title}</Text>
      <Text c="dimmed">
        This uses Convex auth for your account. Google auth is not enabled in
        the current setup, but the auth framework is now in place for future
        provider expansion.
      </Text>
      {mode === "signUp" && (
        <TextInput
          label="Name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      )}
      <TextInput
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <PasswordInput
        label="Password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
      />
      <Group>
        <Button onClick={handleSubmit}>{title}</Button>
        <Button
          variant="default"
          onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          {mode === "signIn" ? "Create account" : "Use existing account"}
        </Button>
      </Group>
      {status && (
        <Alert
          color={status.kind === "success" ? "green" : "red"}
          variant="light"
        >
          {status.message}
        </Alert>
      )}
    </Stack>
  );
}
