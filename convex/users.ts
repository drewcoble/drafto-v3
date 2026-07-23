import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const processEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getAllowedSuperAdminEmails(overrideEmails?: string[] | null) {
  const fromEnv = [
    processEnv?.SUPER_ADMIN_EMAILS,
    processEnv?.VITE_SUPER_ADMIN_EMAILS,
    processEnv?.CONVEX_SUPER_ADMIN_EMAILS,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) =>
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );

  const fromOverride = (overrideEmails ?? [])
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

  return [...new Set([...fromEnv, ...fromOverride])];
}

function getRoleForIdentity(
  identity: { email?: string | null },
  existingRole?: string | null,
  overrideEmails?: string[] | null,
  profileEmail?: string | null,
) {
  const normalizedEmail = normalizeEmail(
    identity.email ?? profileEmail ?? null,
  );
  const allowedEmails = getAllowedSuperAdminEmails(overrideEmails);

  if (allowedEmails.includes(normalizedEmail)) {
    return "super-admin" as const;
  }

  return existingRole === "super-admin"
    ? ("super-admin" as const)
    : ("user" as const);
}

async function getAuthUserEmail(ctx: any, tokenIdentifier: string) {
  const authUser = await ctx.db
    .query("users")
    .filter((q: any) => q.eq(q.field("tokenIdentifier"), tokenIdentifier))
    .first();
  return authUser?.email ?? null;
}

async function getCurrentUserDoc(
  ctx: any,
  tokenIdentifier: string,
  email?: string | null,
) {
  const byTokenIdentifier = await ctx.db
    .query("userProfiles")
    .filter((q: any) => q.eq(q.field("tokenIdentifier"), tokenIdentifier))
    .first();

  if (byTokenIdentifier) {
    return byTokenIdentifier;
  }

  if (email) {
    const byEmail = await ctx.db
      .query("userProfiles")
      .filter((q: any) => q.eq(q.field("email"), email))
      .first();

    if (byEmail) {
      return byEmail;
    }
  }

  return null;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const authEmail = await getAuthUserEmail(ctx, identity.tokenIdentifier);
    return await getCurrentUserDoc(ctx, identity.tokenIdentifier, authEmail);
  },
});

export const ensureCurrentUser = mutation({
  args: {
    allowlistedEmails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be signed in.");
    }

    const authEmail = await getAuthUserEmail(ctx, identity.tokenIdentifier);
    const existing = await getCurrentUserDoc(
      ctx,
      identity.tokenIdentifier,
      authEmail,
    );
    const role = getRoleForIdentity(
      identity,
      existing?.role ?? null,
      args.allowlistedEmails,
      existing?.email ?? authEmail ?? null,
    );

    if (existing) {
      const needsUpdate =
        existing.name !==
          (identity.name ?? identity.email ?? authEmail ?? "User") ||
        existing.email !== (identity.email ?? authEmail ?? null) ||
        existing.role !== role;

      if (needsUpdate) {
        await ctx.db.patch(existing._id, {
          tokenIdentifier: identity.tokenIdentifier,
          name: identity.name ?? identity.email ?? authEmail ?? "User",
          email: identity.email ?? authEmail ?? null,
          role,
        });
      }

      return await ctx.db.get(existing._id);
    }

    const newUserId = await ctx.db.insert("userProfiles", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? identity.email ?? authEmail ?? "User",
      email: identity.email ?? authEmail ?? null,
      fantasyProsSessionCookie: null,
      fantasyProsUsername: null,
      fantasyProsConnectedAt: null,
      fantasyProsEnabled: false,
      role,
      createdAt: Date.now(),
    });

    return await ctx.db.get(newUserId);
  },
});

export const getCurrentUserForScrape = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const authEmail = await getAuthUserEmail(ctx, identity.tokenIdentifier);
    return await getCurrentUserDoc(ctx, identity.tokenIdentifier, authEmail);
  },
});

export const promoteCurrentUserToSuperAdmin = mutation({
  args: {
    allowlistedEmails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be signed in.");
    }

    const authEmail = await getAuthUserEmail(ctx, identity.tokenIdentifier);
    const currentUser = await getCurrentUserDoc(
      ctx,
      identity.tokenIdentifier,
      authEmail,
    );
    const normalizedEmail = normalizeEmail(
      identity.email ?? currentUser?.email ?? null,
    );
    const allowedEmails = getAllowedSuperAdminEmails(args.allowlistedEmails);

    if (
      currentUser?.role !== "super-admin" &&
      !allowedEmails.includes(normalizedEmail)
    ) {
      throw new Error(
        "Your email is not allowlisted as a super-admin. Add it to VITE_SUPER_ADMIN_EMAILS in .env.local (or SUPER_ADMIN_EMAILS in the Convex environment) and restart the app.",
      );
    }

    if (!currentUser) {
      const newUserId = await ctx.db.insert("userProfiles", {
        tokenIdentifier: identity.tokenIdentifier,
        name: identity.name ?? identity.email ?? "User",
        email: identity.email ?? null,
        fantasyProsSessionCookie: null,
        fantasyProsUsername: null,
        fantasyProsConnectedAt: null,
        fantasyProsEnabled: false,
        role: "super-admin",
        createdAt: Date.now(),
      });
      return await ctx.db.get(newUserId);
    }

    await ctx.db.patch(currentUser._id, {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? authEmail ?? currentUser.email,
      name: identity.name ?? identity.email ?? authEmail ?? currentUser.name,
      role: "super-admin",
    });

    return await ctx.db.get(currentUser._id);
  },
});

export const saveFantasyProsConnection = mutation({
  args: {
    sessionCookie: v.string(),
    username: v.optional(v.string()),
    allowlistedEmails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be signed in.");
    }

    const authEmail = await getAuthUserEmail(ctx, identity.tokenIdentifier);
    const existing = await getCurrentUserDoc(
      ctx,
      identity.tokenIdentifier,
      authEmail,
    );
    const role = getRoleForIdentity(
      identity,
      existing?.role ?? null,
      args.allowlistedEmails,
      existing?.email ?? authEmail ?? null,
    );

    if (!existing) {
      const newUserId = await ctx.db.insert("userProfiles", {
        tokenIdentifier: identity.tokenIdentifier,
        name: identity.name ?? identity.email ?? authEmail ?? "User",
        email: identity.email ?? authEmail ?? null,
        fantasyProsSessionCookie: args.sessionCookie.trim() || null,
        fantasyProsUsername: args.username?.trim() || null,
        fantasyProsConnectedAt: Date.now(),
        fantasyProsEnabled: Boolean(args.sessionCookie.trim()),
        role,
        createdAt: Date.now(),
      });
      return await ctx.db.get(newUserId);
    }

    await ctx.db.patch(existing._id, {
      tokenIdentifier: identity.tokenIdentifier,
      fantasyProsSessionCookie: args.sessionCookie.trim() || null,
      fantasyProsUsername: args.username?.trim() || null,
      fantasyProsConnectedAt: Date.now(),
      fantasyProsEnabled: Boolean(args.sessionCookie.trim()),
      role,
    });

    return await ctx.db.get(existing._id);
  },
});
