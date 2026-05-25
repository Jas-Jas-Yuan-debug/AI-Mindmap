// Migration framework for `.aimap` documents.
//
// `formatVersion` is the migration anchor (plan §5). When a breaking schema
// change lands, bump AIMAP_FORMAT_VERSION and register a step here that maps a
// document from version N to N+1. `migrate()` reads the document's declared
// `formatVersion` and applies registered steps in order until the document is
// at the current version, then validates it with `parseAimapFile`.
//
// V1 is the current (and first) version, so the registry is EMPTY — there is
// nothing to migrate forward from yet. This module is scaffolded so future
// versions are a pure additive change: write a `vN-to-v(N+1).ts` step and
// push it into `MIGRATIONS`.
//
// Pure module — no fs / IPC. Imported by both platform impls and the renderer.

import {
  AIMAP_FORMAT_VERSION,
  type AimapFile,
  parseAimapFile,
} from "../aimap.js";

/**
 * A single forward migration step. `from` is the version it upgrades FROM;
 * it returns a document shaped for version `from + 1`. Steps operate on loose
 * `unknown` documents because intermediate shapes predate the current types.
 */
export interface Migration {
  from: number;
  to: number;
  /** Transform a doc at version `from` into one at version `to`. */
  up(doc: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Registered migrations, ordered by `from` ascending. EMPTY for V1.
 *
 * Example future entry (when V2 lands):
 *   import { v1ToV2 } from "./v1-to-v2.js";
 *   export const MIGRATIONS: Migration[] = [v1ToV2];
 */
export const MIGRATIONS: Migration[] = [];

/** Thrown when a document declares a version we cannot load. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

/**
 * Read a raw document's `formatVersion` and migrate it forward to the current
 * version, then validate. Throws `MigrationError` if:
 *   - the document is not an object or has no numeric `formatVersion`
 *   - the version is NEWER than this app supports (no downgrade path)
 *   - a required migration step is missing
 *   - the migrated document fails final validation
 *
 * Returns a fully-validated `AimapFile` at the current `formatVersion`.
 */
export function migrate(doc: unknown): AimapFile {
  if (typeof doc !== "object" || doc === null) {
    throw new MigrationError("Document is not a JSON object.");
  }
  const record = doc as Record<string, unknown>;
  const version = record.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new MigrationError(
      "Document is missing an integer 'formatVersion'; cannot determine how to load it.",
    );
  }

  if (version > AIMAP_FORMAT_VERSION) {
    throw new MigrationError(
      `Document was written by a newer version of AI-Mindmap (formatVersion ${version}, ` +
        `this app supports up to ${AIMAP_FORMAT_VERSION}). Please update the app to open it.`,
    );
  }

  let current = record;
  let currentVersion = version;
  while (currentVersion < AIMAP_FORMAT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!step) {
      throw new MigrationError(
        `No migration registered from formatVersion ${currentVersion} to ${currentVersion + 1}.`,
      );
    }
    current = step.up(current);
    currentVersion = step.to;
  }

  const parsed = parseAimapFile(current);
  if (!parsed.ok) {
    throw new MigrationError(
      `Document failed validation after migration: ${parsed.error}`,
    );
  }
  return parsed.data;
}
