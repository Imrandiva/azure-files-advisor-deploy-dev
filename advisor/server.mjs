// Standalone HTTP server for the Azure Files Provisioned v2 Provisioning Advisor.
//
// Serves the single-page UI, the shared advisor math module, and a /usage
// endpoint that pulls live FileShare metrics from Azure Monitor for whatever
// subscription / resource group / storage account the user enters in the UI.
//
// Run locally:   npm start            (then open http://localhost:8080)
// In a container: exposed on PORT (default 8080).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderHtml } from "./ui.mjs";
import { fetchShareUsage } from "./azusage.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

async function advisorJs() {
  return readFile(join(HERE, "advisor.mjs"), "utf8");
}

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url || "/", "http://localhost");

    if (u.pathname === "/healthz") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (u.pathname === "/advisor.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(await advisorJs());
      return;
    }

    if (u.pathname === "/usage") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const auth = req.headers["authorization"] || "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
        // When login is configured, require the caller's delegated token so the
        // read runs as the signed-in user (their RBAC), not the host identity.
        if (process.env.AAD_CLIENT_ID && !bearer) {
          res.end(JSON.stringify({ ok: false, error: "Sign in with your Azure account first." }));
          return;
        }
        const usage = await fetchShareUsage({
          subscriptionId: u.searchParams.get("subscription"),
          resourceGroup: u.searchParams.get("rg"),
          storageAccount: u.searchParams.get("account"),
          accessToken: bearer,
        });
        res.end(JSON.stringify({ ok: true, usage }));
      } catch (err) {
        res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      }
      return;
    }

    // Everything else -> the single-page app. Prefill from env if provided so a
    // hoster can pin a default subscription/RG/account for their team.
    const prefill = {};
    if (process.env.DEFAULT_SUBSCRIPTION_ID) prefill.subscriptionId = process.env.DEFAULT_SUBSCRIPTION_ID;
    if (process.env.DEFAULT_RESOURCE_GROUP) prefill.resourceGroup = process.env.DEFAULT_RESOURCE_GROUP;
    if (process.env.DEFAULT_STORAGE_ACCOUNT) prefill.storageAccount = process.env.DEFAULT_STORAGE_ACCOUNT;
    if (process.env.AAD_CLIENT_ID) {
      prefill.aad = {
        clientId: process.env.AAD_CLIENT_ID,
        tenantId: process.env.AAD_TENANT_ID || "organizations",
      };
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderHtml(prefill));
  } catch (err) {
    res.statusCode = 500;
    res.end("error: " + String((err && err.message) || err));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Provisioning Advisor listening on http://0.0.0.0:${PORT}`);
});
