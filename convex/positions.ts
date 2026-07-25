import { v } from "convex/values";

export const POSITIONS = ["QB", "RB", "WR", "TE", "DST"] as const;

export const positionValidator = v.union(
  v.literal("QB"),
  v.literal("RB"),
  v.literal("WR"),
  v.literal("TE"),
  v.literal("DST"),
);
