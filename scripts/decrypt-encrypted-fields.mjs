#!/usr/bin/env node
/* global console, process */
/**
 * One-off migration: turns the values written by prisma-field-encryption back into
 * clear text, so the dependency can be removed.
 *
 * The extension is a thin layer over @47ng/cloak: on read it checks whether a value is a
 * cloak ciphertext, looks up the matching key in a keychain built from
 * PRISMA_FIELD_ENCRYPTION_KEY (+ PRISMA_FIELD_DECRYPTION_KEYS) and decrypts it. This script
 * does exactly that, so it does not need the DMMF or the extension itself.
 *
 * It talks to the database with a *plain* Prisma client, so values written back are stored
 * in clear text and there is no risk of re-encrypting them.
 *
 * Usage (from the project root, after `npm run build`):
 *   node scripts/decrypt-encrypted-fields.mjs           # dry run: report only
 *   node scripts/decrypt-encrypted-fields.mjs --apply   # write the clear-text values back
 *
 * It is idempotent: values that are already clear text are left alone, so it is safe to
 * run again after a deploy to catch anything the app wrote while the old build was live.
 *
 * Plain-text values are never printed -- only counts, plus the row id of values that fail.
 */
import "dotenv/config";

import {
  decryptStringSync,
  findKeyForMessage,
  makeKeychainSync,
  parseCloakedString,
} from "@47ng/cloak";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

/**
 * The `/// @encrypted` fields in prisma/schema.prisma, which is what the extension used to
 * read its annotations from. Keep in sync with the schema if it changes before this script
 * has run for the last time.
 */
const targets = [
  { model: "channel", id: "id", fields: ["webhookToken"] },
  { model: "message", id: "internalId", fields: ["content"] },
  {
    model: "messageEmbed",
    id: "id",
    fields: [
      "title",
      "description",
      "url",
      "authorName",
      "authorUrl",
      "authorIconUrl",
      "footerText",
      "footerIconUrl",
      "thumbnailUrl",
    ],
  },
  { model: "embedField", id: "id", fields: ["name", "value"] },
  { model: "user", id: "id", fields: ["oauthToken", "refreshToken"] },
  { model: "staffProfile", id: "id", fields: ["name", "avatar"] },
  { model: "guildBan", id: "id", fields: ["reason", "message"] },
  { model: "userBan", id: "id", fields: ["reason", "message"] },
  { model: "warning", id: "id", fields: ["reason", "message"] },
  { model: "report", id: "id", fields: ["title", "reason"] },
  { model: "reportMessage", id: "id", fields: ["content"] },
];

const batchSize = 500;

const apply = process.argv.includes("--apply");

const buildKeychain = () => {
  const encryptionKey = process.env.PRISMA_FIELD_ENCRYPTION_KEY;

  if (encryptionKey === undefined || encryptionKey === "") {
    throw new Error(
      "PRISMA_FIELD_ENCRYPTION_KEY is not set; without it the ciphertext cannot be read.",
    );
  }

  const decryptionKeys = (process.env.PRISMA_FIELD_DECRYPTION_KEYS ?? "")
    .split(",")
    .filter(Boolean);

  return makeKeychainSync([...new Set([encryptionKey, ...decryptionKeys])]);
};

const decrypt = (value, keychain) =>
  decryptStringSync(value, findKeyForMessage(value, keychain));

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ model: string, id: string, fields: string[] }} target
 * @param {ReturnType<typeof buildKeychain>} keychain
 */
const decryptTarget = async (prisma, target, keychain) => {
  const stats = { rows: 0, decrypted: 0, clear: 0, failed: 0 };
  const delegate = prisma[target.model];
  const columns = [target.id, ...target.fields];
  const select = Object.fromEntries(columns.map((name) => [name, true]));

  // No server-side null filter: `{ not: null }` is rejected by Prisma 7 for required
  // columns, and nulls are skipped below anyway. Every column is scanned either way, since
  // none of these fields are indexed.
  let cursor;
  for (;;) {
    const rows = await delegate.findMany({
      select,
      orderBy: { [target.id]: "asc" },
      take: batchSize,
      ...(cursor === undefined
        ? {}
        : { cursor: { [target.id]: cursor }, skip: 1 }),
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      /** @type {Record<string, string>} */
      const updates = {};
      let rowFailed = false;

      for (const field of target.fields) {
        const value = row[field];

        if (value === null || value === undefined) {
          continue;
        }

        if (parseCloakedString(value) === false) {
          // Already clear text (or written after the extension was removed).
          stats.clear += 1;
          continue;
        }

        try {
          updates[field] = decrypt(value, keychain);
          stats.decrypted += 1;
        } catch (error) {
          // Leave the whole row alone: a partially clear-text row is harder to reason
          // about than one that is still fully encrypted.
          rowFailed = true;
          stats.failed += 1;
          console.error(
            `${target.model}.${field} (${String(row[target.id])}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (rowFailed || Object.keys(updates).length === 0) {
        continue;
      }

      if (apply) {
        await delegate.update({
          where: { [target.id]: row[target.id] },
          data: updates,
        });
      }
    }

    stats.rows += rows.length;
    cursor = rows.at(-1)[target.id];

    if (rows.length < batchSize) {
      break;
    }
  }

  return stats;
};

const main = async () => {
  const keychain = buildKeychain();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const totals = { rows: 0, decrypted: 0, clear: 0, failed: 0 };

  console.log(
    apply
      ? "Applying: clear-text values will be written back."
      : "Dry run: nothing will be written. Pass --apply to write.",
  );

  for (const target of targets) {
    const stats = await decryptTarget(prisma, target, keychain);

    totals.rows += stats.rows;
    totals.decrypted += stats.decrypted;
    totals.clear += stats.clear;
    totals.failed += stats.failed;

    console.log(
      `${target.model}: ${String(stats.rows)} row(s), ${String(stats.decrypted)} decrypted, ${String(stats.clear)} already clear, ${String(stats.failed)} failed`,
    );
  }

  await prisma.$disconnect();

  console.log(
    `\n${apply ? "Decrypted" : "Would decrypt"} ${String(totals.decrypted)} value(s) across ${String(totals.rows)} scanned row(s); ${String(totals.clear)} value(s) were already clear text, ${String(totals.failed)} failed.`,
  );

  if (totals.failed > 0) {
    console.error(
      "\nSome values could not be decrypted. Check that PRISMA_FIELD_ENCRYPTION_KEY (and any PRISMA_FIELD_DECRYPTION_KEYS) match the keys the data was written with. Rows with a failing value were left untouched, so nothing was lost.",
    );
    process.exitCode = 1;
  }
};

await main();
