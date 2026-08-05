import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { theme } from "./theme";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!convexUrl) {
  throw new Error(
    "VITE_CONVEX_URL is not set. Copy .env.local.example to .env.local and fill it in " +
      "(the URL is printed when you run `npx convex dev`).",
  );
}

const convex = new ConvexReactClient(convexUrl);

// Lets components use TanStack Query's useQuery (via convexQuery()) for
// Convex queries where its caching semantics - especially
// placeholderData/isFetching - are useful, e.g. keeping a table's previous
// results visible while its args change instead of flashing to a loading
// state. Still backed by Convex's live/reactive subscriptions under the hood.
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});
convexQueryClient.connect(queryClient);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <RouterProvider router={router} />
        </MantineProvider>
      </QueryClientProvider>
    </ConvexAuthProvider>
  </React.StrictMode>,
);
