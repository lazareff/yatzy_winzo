# Feature: gameId-based table grouping

## Summary
Add optional URL parameter `gameId=<string>` so that players with the same value join the same table. If `gameId` is omitted, matchmaking works as it does today.

## Goals / Acceptance Criteria
- When a client connects with `?gameId=XYZ`, they are matched into a table identified by `XYZ`.
- Multiple concurrent tables with different `gameId` values can exist simultaneously.
- If `gameId` is not provided, behavior remains unchanged (fill the next available table).
- Reconnect flows continue to work: a reconnecting client with the same `winzoId` is routed back to their table (existing behavior) regardless of `gameId`.
- Works with both `mode=sync` and `mode=async`.
- Backward compatible: older clients without `gameId` keep working.

## Non-Goals / Out of Scope
- Persistence across server restarts.
- Private/invite-only rooms and authorization beyond a simple shared identifier.

## API / Contract
- Client (web):
  - Accept `gameId` from URL: `http://localhost:3000/?id=1&gameId=table42`.
  - Store `gameId` to localStorage; forward it to server as a WebSocket query param.
- Server (WebSocket):
  - Read optional `gameId` from query.
  - Group users by `gameId` when building/joining tables. Tables formed without `gameId` continue to use the existing incremental key logic.

## Implementation Plan
1. Client
   - Update `core/client/index.ts`:
     - Read `gameId` from URL/localStorage.
     - Append to WebSocket query string.
2. Server
   - Update `core/server/index.ts`:
     - Parse `gameId` from `address.query`.
     - Modify `addJoinedIdToArray(winzoId, gameId?)` to:
       - If `gameId` provided: use `gameId` as the table key and fill that table up to `noOfPlayers`.
       - If missing: keep current behavior (fill first non-full table or create a new numeric key).
   - Keep `findJoinedIdInArray` and removal helpers working with either numeric or string keys.
3. Compatibility & Fallbacks
   - If a given `gameId` table is full, additional players with the same `gameId` should be placed into a new table with the same `gameId`-derived key (e.g., `gameId#2`) or stay queued until table vacates — decide simplest approach (initially: create a new table with numeric suffix or return a full flag).
4. Bot behavior
   - Unchanged.
5. Modes
   - No code changes required for `mode=sync|async` outside of grouping; both modes operate transparently once a table is formed.

## Edge Cases
- Two tabs join with the same `gameId` but different `noOfPlayers` configuration (via code change):
  - Use global `gamesData[gameToRun].config.noOfPlayers`; clients cannot override it.
- Reconnect without `gameId` in URL:
  - Existing `winzoId` reconnection logic should find the table; `gameId` is only used for initial grouping.
- Table becomes empty: existing cleanup paths remove the table key.

## Test Plan
- Manual
  - Open two tabs with `?id=1&gameId=roomA` and `?id=2&gameId=roomA` → they join same table.
  - Open `?id=3` without `gameId` → joins default flow unrelated to `roomA`.
  - Repeat with `mode=async` and confirm independent turns; scoreboard visible on both.
  - Reconnect with same `id` while omitting `gameId` and confirm re-join.
- Automated (optional / later)
  - Unit tests for grouping helpers with and without `gameId`.

## Rollout
- Ship behind soft rollout (docs first).
- Add README once implemented: document `gameId` and examples.
