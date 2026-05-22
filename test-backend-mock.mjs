import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 18789 });
console.log("Mock Gateway running on ws://localhost:18789");

wss.on("connection", (ws) => {
  console.log("Client connected!");

  // 1. Send the challenge to trigger the client handshake
  ws.send(
    JSON.stringify({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "123", ts: Date.now() },
    }),
  );

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data);
      console.log("Received RPC request:", message.method);

      if (message.method === "connect") {
        ws.send(
          JSON.stringify({
            type: "res",
            ok: true,
            id: message.id,
            payload: { snapshot: {} },
          }),
        );
        console.log("Handshake successful, UI should show connected!");
      } else if (message.method === "config.env.get") {
        ws.send(
          JSON.stringify({
            type: "res",
            ok: true,
            id: message.id,
            payload: {
              env: {
                GEMINI_API_KEY: "test_secure_sync_gateway",
                OPENCLAW_REDIS_URL: "redis://192.168.1.10",
              },
            },
          }),
        );
      } else if (message.method === "config.env.set") {
        ws.send(
          JSON.stringify({
            type: "res",
            ok: true,
            id: message.id,
            payload: { ok: true },
          }),
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "res",
            ok: false,
            id: message.id,
            error: { code: -32601, message: "Method not found" },
          }),
        );
      }
    } catch (e) {
      console.error(e);
    }
  });
});
