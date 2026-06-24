/**
 * In-memory room registry. Tracks which socket ids belong to which room so we
 * can notify peers of joins/leaves and clean up empty rooms.
 *
 * This is intentionally simple (single-process, in-memory). For horizontal
 * scaling, back this with the Socket.IO Redis adapter; the protocol stays
 * the same.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Set<string>>();

  /** Current peers in a room (excluding none). */
  peers(roomId: string): string[] {
    return [...(this.rooms.get(roomId) ?? [])];
  }

  size(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  /** Add a socket to a room. Returns the peers that were already present. */
  add(roomId: string, socketId: string): string[] {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Set<string>();
      this.rooms.set(roomId, room);
    }
    const existing = [...room];
    room.add(socketId);
    return existing;
  }

  /**
   * Remove a socket from a room. Deletes the room when it becomes empty.
   * Returns true if the socket was actually in the room.
   */
  remove(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const removed = room.delete(socketId);
    if (room.size === 0) this.rooms.delete(roomId);
    return removed;
  }

  roomCount(): number {
    return this.rooms.size;
  }
}
