import "dotenv/config";

import * as Sentry from "@sentry/node";
import { rewriteFramesIntegration } from "@sentry/node";
import * as url from "url";

// __dirname is not available in ESM modules; compute directory from import.meta.url
const rootDir =
  url.fileURLToPath(new URL(".", import.meta.url)) || process.cwd();
const gitRevision = process.env.GIT_REVISION; // TODO Fix

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    rewriteFramesIntegration({
      root: rootDir,
    }),
  ],
  //release: "my-project-name@" + (process.env.npm_package_version ?? ""),
  release: gitRevision,
});
