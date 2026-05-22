import { createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocketServer } from "ws";
import { rawDataToString } from "../infra/ws.js";
import { GatewayClient } from "./client.js";

// Find a free localhost port for ad-hoc WS servers.
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function createSelfSignedTlsFixture(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), "hoc-gateway-tls-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=IP:127.0.0.1,DNS:localhost",
        "-days",
        "1",
      ],
      { stdio: "ignore" },
    );
    return {
      key: readFileSync(keyPath, "utf8"),
      cert: readFileSync(certPath, "utf8"),
    };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

describe("GatewayClient", () => {
  let wss: WebSocketServer | null = null;
  let httpsServer: ReturnType<typeof createHttpsServer> | null = null;

  afterEach(async () => {
    if (wss) {
      for (const client of wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => wss?.close(() => resolve()));
      wss = null;
    }
    if (httpsServer) {
      httpsServer.closeAllConnections?.();
      httpsServer.closeIdleConnections?.();
      await new Promise<void>((resolve) => httpsServer?.close(() => resolve()));
      httpsServer = null;
    }
  });

  test("closes on missing ticks", async () => {
    const port = await getFreePort();
    wss = new WebSocketServer({ port, host: "127.0.0.1" });

    wss.on("connection", (socket) => {
      socket.once("message", (data) => {
        const first = JSON.parse(rawDataToString(data)) as { id?: string };
        const id = first.id ?? "connect";
        // Respond with tiny tick interval to trigger watchdog quickly.
        const helloOk = {
          type: "hello-ok",
          protocol: 2,
          server: { version: "dev", connId: "c1" },
          features: { methods: [], events: [] },
          snapshot: {
            presence: [],
            health: {},
            stateVersion: { presence: 1, health: 1 },
            uptimeMs: 1,
          },
          policy: {
            maxPayload: 512 * 1024,
            maxBufferedBytes: 1024 * 1024,
            tickIntervalMs: 5,
          },
        };
        socket.send(JSON.stringify({ type: "res", id, ok: true, payload: helloOk }));
      });
    });

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      const client = new GatewayClient({
        url: `ws://127.0.0.1:${port}`,
        onClose: (code, reason) => resolve({ code, reason }),
      });
      client.start();
    });

    const res = await closed;
    expect(res.code).toBe(4000);
    expect(res.reason).toContain("tick timeout");
  }, 4000);

  test("rejects mismatched tls fingerprint", async () => {
    const { key, cert } = createSelfSignedTlsFixture();

    httpsServer = createHttpsServer({ key, cert });
    wss = new WebSocketServer({ server: httpsServer, maxPayload: 1024 * 1024 });
    const port = await new Promise<number>((resolve, reject) => {
      httpsServer?.once("error", reject);
      httpsServer?.listen(0, "127.0.0.1", () => {
        const address = httpsServer?.address();
        if (!address || typeof address === "string") {
          reject(new Error("https server address unavailable"));
          return;
        }
        resolve(address.port);
      });
    });

    let client: GatewayClient | null = null;
    const error = await new Promise<Error>((resolve) => {
      let settled = false;
      const finish = (err: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(err);
      };
      const timeout = setTimeout(() => {
        client?.stop();
        finish(new Error("timeout waiting for tls error"));
      }, 2000);
      client = new GatewayClient({
        url: `wss://127.0.0.1:${port}`,
        tlsFingerprint: "deadbeef",
        onConnectError: (err) => {
          clearTimeout(timeout);
          client?.stop();
          finish(err);
        },
        onClose: () => {
          clearTimeout(timeout);
          client?.stop();
          finish(new Error("closed without tls error"));
        },
      });
      client.start();
    });

    expect(String(error)).toContain("tls fingerprint mismatch");
  });
});
