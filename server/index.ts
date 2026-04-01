import { WebSocketServer } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { OSRS_TICK_MS } from '../shared/tick';
import { persistTerrainEdit } from './terrainStore';
import { GameWorld } from './world';

const PORT = Number(process.env.MULTIPLAYER_PORT ?? 3850);

const wss = new WebSocketServer({ port: PORT });
const world = new GameWorld();

console.log(`[multiplayer] WebSocket on ws://localhost:${PORT}`);

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let data: ClientMsg;
    try {
      data = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return;
    }
    if (data.t === 'join') {
      const had = world.getBySocket(socket);
      if (!had) {
        const p = world.addPlayer(socket, data.name);
        socket.send(JSON.stringify(world.welcomeMsg(p)));
        world.broadcastSnapshots();
      }
      return;
    }
    if (data.t === 'ping') {
      const out: ServerMsg = { t: 'pong', clientTime: data.clientTime };
      socket.send(JSON.stringify(out));
      return;
    }
    if (data.t === 'move') {
      world.applyMove(socket, data.tx, data.tz, data.goalTx, data.goalTz);
      world.broadcastSnapshots();
      return;
    }
    if (data.t === 'hitSplat') {
      const p = world.getBySocket(socket);
      if (!p) return;
      world.broadcastPeerHitSplat(p, data.x, data.y, data.z, data.amount);
      return;
    }
    if (data.t === 'terrainEdit') {
      const p = world.getBySocket(socket);
      if (!p) return;
      const brushRadius = Math.max(0, Math.min(8, Math.floor(Number(data.brushRadius) || 0)));
      const textureIndex = Math.max(0, Math.floor(Number(data.textureIndex) || 0));
      const heightStep = Math.min(4, Math.max(0.05, Number(data.heightStep) || 0.25));
      const mode =
        data.mode === 'texture' ||
        data.mode === 'raise' ||
        data.mode === 'lower' ||
        data.mode === 'water' ||
        data.mode === 'water_erase'
          ? data.mode
          : 'texture';
      persistTerrainEdit(data.tx, data.tz, mode, textureIndex, heightStep, brushRadius);
      const relay: ServerMsg = {
        t: 'terrainEdit',
        fromPlayerId: p.id,
        tx: data.tx,
        tz: data.tz,
        mode,
        textureIndex,
        heightStep,
        brushRadius,
      };
      const raw = JSON.stringify(relay);
      wss.clients.forEach((client) => {
        if (client === socket) return;
        if (client.readyState !== 1 /* OPEN */) return;
        client.send(raw);
      });
      return;
    }
  });

  socket.on('close', () => {
    world.removeBySocket(socket);
  });
});

setInterval(() => {
  world.tick++;
  world.broadcastSnapshots();
}, OSRS_TICK_MS);
