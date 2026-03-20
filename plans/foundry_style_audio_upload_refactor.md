# Foundry-Style Audio Upload Refactor

## Objective
Replace the current mixed audio source system with a single server-backed asset workflow:

- GM uploads audio files to the server
- server stores files in a persistent uploads directory
- server exposes those files through static URLs
- tracks store server URLs, not blob URLs or relative filenames
- all clients can stream the same audio file
- remove local blob-based audio mode

This change must be implemented carefully and with minimal scope creep. Do not redesign unrelated audio logic.

---

## Core Rules

1. Keep the existing audio playback engine unless a specific change is required for server URLs.
2. Remove blob URL audio flow completely.
3. Keep GM-only upload/settings access.
4. Use persistent file storage on the server.
5. Store the final public file path in each track.
6. Do not prepend runtime base paths if the track already stores the full public path.
7. Preserve existing playlists and track UI as much as possible.
8. Validate file types and sanitize filenames.
9. Return structured API responses and handle errors explicitly.
10. Do not break existing multiplayer playback events.

---

## Required End State

After refactor, the system should behave like this:

1. GM selects one or more audio files to upload.
2. Client sends files to `POST /api/upload-audio`.
3. Server stores them under a persistent directory such as:
   - `uploads/audio/music`
   - `uploads/audio/ambience`
   - `uploads/audio/sfx`
4. Server exposes `/uploads` as a static directory.
5. Upload API returns the public file path for each stored file.
6. Client creates or updates track entries using the returned public path.
7. Playback uses that stored path directly.
8. All players can access the same track URL.

Example stored track shape:

```ts
{
  id: "uuid",
  name: "Dungeon Drip",
  file: "/uploads/audio/ambience/1719942000-dungeon-drip.ogg"
}
```

---

## Required Refactor Plan

### 1. Server: add static serving for uploaded assets
Add an Express static mount for the uploads directory.

Target behavior:

```ts
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
```

Do not serve from `client/dist/assets` for uploaded user content.

---

### 2. Server: implement missing upload endpoint
Implement:

```http
POST /api/upload-audio
```

Use `multer` disk storage.

Requirements:
- create destination directories if missing
- accept audio files only
- sanitize file names
- prefix filename with timestamp or unique id to avoid collisions
- return JSON with success state and public path
- reject invalid file types with clear errors
- keep response format stable

Preferred response format:

```json
{
  "success": true,
  "files": [
    {
      "originalName": "dungeon-drip.ogg",
      "filename": "1719942000-dungeon-drip.ogg",
      "path": "/uploads/audio/ambience/1719942000-dungeon-drip.ogg"
    }
  ]
}
```

If your existing UI uploads one file at a time, that is acceptable, but structure the implementation so multiple-file support is easy.

---

### 3. Server: validate uploads
Accept only audio extensions you explicitly support.

Recommended allowlist:
- `.mp3`
- `.ogg`
- `.wav`
- `.webm`
- `.m4a`
- `.flac` if your playback support is intentional

Also validate MIME type where practical, but extension validation is still required.

Reject anything else.

---

### 4. Client: remove local blob audio mode
Delete all local-only blob URL workflow.

Remove:
- `audioSourceMode === 'local'`
- `localFileBlobUrlsRef`
- `URL.createObjectURL(...)`
- blob URL lookup in `resolveAudioPath()`
- blob cleanup logic tied to audio source mode
- UI text and options for local dropped files

There should be one authoritative source mode after refactor: server-backed files.

If settings UI currently requires a mode selector, remove it or hardcode it temporarily until the UI is cleaned up.

---

### 5. Client: simplify path resolution
Refactor `resolveAudioPath()` so it does not guess paths from filenames.

New rule:
- `track.file` already contains the correct public URL
- playback should use `track.file` directly

Target behavior:

```ts
function resolveAudioPath(file: string) {
  return file;
}
```

If there is legacy support code for old relative filenames, keep it only if necessary and isolate it behind a small compatibility fallback. Do not keep blob logic.

---

### 6. Client: update upload flow
In the audio settings or upload UI:

- GM chooses file(s)
- client sends `FormData` to `/api/upload-audio`
- client reads returned `path`
- track is created using that returned path
- playlist updates persist as normal

Do not store only the raw filename. Store the returned public path.

---

### 7. Client: drag and drop behavior
If the current audio panel supports drag-and-drop onto playlists, change its behavior:

Old behavior:
- convert dropped file to blob URL
- store filename as key
- keep blob in memory only

New behavior:
- upload dropped file to server
- use returned public path
- add track to playlist
- no blob URL generation

This is critical.

---

### 8. Playback: keep engine stable
Do not rewrite `useAudioEngine.ts` unless necessary.

The existing HTML5 Audio API should continue to work if it receives a normal server URL:

```ts
const audio = new Audio(track.file);
```

Only change code if it currently assumes blob or server-base-path concatenation.

---

### 9. Multiplayer: preserve shared playback
Ensure the GM playback event still broadcasts the selected track metadata to players.

Players must receive a track whose `file` field is already the correct public URL.

Do not require each client to reconstruct the URL locally.

---

### 10. Data compatibility
Check how playlists and tracks are persisted.

If old data stores only filenames, implement one of these:
- migration to full public paths, preferred
- temporary fallback resolver for legacy entries

Keep this compatibility layer narrow and removable.

---

## Implementation Constraints

- make the smallest safe set of changes
- do not refactor unrelated UI or audio features
- do not rename data structures unless required
- keep TypeScript types accurate
- add explicit error handling for upload failures
- surface useful error messages to the GM
- avoid duplicate code paths for file handling
- do not leave dead blob-mode code behind

---

## Suggested Technical Shape

### Server upload storage
Use `multer.diskStorage(...)` with:
- destination based on `uploads/audio/...`
- filename generated from safe slug + timestamp or uuid

### Express route
Recommended shape:

```ts
router.post('/upload-audio', upload.array('files'), handler)
```

or:

```ts
router.post('/upload-audio', upload.single('file'), handler)
```

Either is acceptable if client and server match.

### Static serving
Use a single source of truth:
- filesystem root: `uploads/`
- public root: `/uploads`

---

## Acceptance Criteria

The implementation is complete only if all of the following are true:

1. GM can upload audio from the UI successfully.
2. Uploaded file is written to persistent server storage.
3. Uploaded file is reachable by URL under `/uploads/...`.
4. New track entries store the public server path.
5. Playback works after page refresh.
6. Other connected players can hear the same track.
7. No blob URLs are used anywhere in the audio path flow.
8. Local dropped-file mode no longer exists.
9. The old missing `/api/upload-audio` bug is fixed.
10. TypeScript compiles and no broken references remain.

---

## Files Likely Involved

Adjust names to actual project structure, but expect changes in files like:

- `AudioSourceSettings.tsx`
- `AudioPanel.tsx`
- `useAudioPaths.ts`
- `useAudioEngine.ts`
- server upload route file
- Express server bootstrap where static middleware is configured
- playlist or track persistence layer
- websocket/shared playback event code if it rebuilds paths

---

## Recommended Work Order

1. implement server static upload directory
2. implement upload endpoint
3. test raw upload manually
4. refactor client upload UI to use endpoint
5. remove blob/local mode
6. simplify path resolution
7. update drag-and-drop flow
8. verify persistence after refresh
9. verify multiplayer playback
10. clean dead code and type errors

---

## Deliverables

The code AI should provide:

1. all required code changes
2. any new server route/module files
3. any updated TypeScript types
4. a concise summary of changed files
5. brief verification steps

Do not stop after partial implementation.
