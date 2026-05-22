import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:18789", {
  headers: {
    Authorization: "Bearer dev-secret-token",
  },
});

ws.on("open", () => {
  console.log("Connected to Gateway WebSocket natively!");
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "config.env.get",
      params: {},
    }),
  );
});

ws.on("message", (buf) => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  console.log("Received:", String(buf).toString());
  ws.close();
});

ws.on("error", (e) => {
  console.error("Native WS Error:", e.message);
});

ws.on("close", () => {
  console.log("Connection closed.");
});
