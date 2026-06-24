import { config } from "./config.js";
import { createSignalingServer } from "./server.js";

const { httpServer, io, rooms } = createSignalingServer({
  corsOrigin: config.corsOrigin,
  maxPeersPerRoom: config.maxPeersPerRoom,
});

httpServer.listen(config.port, () => {
  console.log(`Signaling server listening on :${config.port}`);
  console.log(`CORS origin: ${JSON.stringify(config.corsOrigin)}`);
});

// Graceful shutdown so sockets are closed cleanly during dev restarts.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down (${rooms.roomCount()} rooms)...`);
    io.close();
    httpServer.close(() => process.exit(0));
  });
}
