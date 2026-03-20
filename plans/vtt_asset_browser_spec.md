# VTT Asset File Browser --- Implementation Spec

## Goal

Provide a GM-controlled asset browser for the VTT that allows browsing
server-mapped folders, uploading assets, and dragging files into
droppable UI targets (canvas, audio tracks, portraits, etc).

Browser cannot access arbitrary local folders; all files must exist on
the server.

------------------------------------------------------------------------

# 1. Server Folder Structure

/assets /maps /tokens /portraits /items /audio /music /sfx /handouts
/\_thumbs

Serve `/assets` statically via Express.

------------------------------------------------------------------------

# 2. Asset API

## List Folder

GET /api/assets?path=/tokens

Response { path: "/tokens", folders: \["goblins","undead"\], files: \[ {
name: "goblin.png", type: "image", url: "/assets/tokens/goblin.png",
thumb: "/assets/\_thumbs/goblin.webp" } \] }

------------------------------------------------------------------------

## Upload File

POST /api/assets/upload

FormData file path=/tokens

Implementation - use multer - save file to /assets/`<path>`{=html} -
generate thumbnail if image

------------------------------------------------------------------------

## Delete File

DELETE /api/assets

Body { path: "/tokens/goblin.png" }

------------------------------------------------------------------------

# 3. Thumbnail Generation

If uploaded file is image:

create thumbnail

/assets/\_thumbs/`<filename>`{=html}.webp

Recommended max size 256px

Use sharp library.

------------------------------------------------------------------------

# 4. React UI Structure

FileBrowser ├─ FolderTree ├─ FileGrid └─ UploadZone

Layout

+---------------------------+
| ## File Browser           |
|                           |
|   Folders   Files         |
|                           |
|  --------- -------------- |
|   tokens    goblin.png    |
|   maps      dungeon.webp  |
|   audio     wind.mp3      |
+---------------------------+

------------------------------------------------------------------------

# 5. Drag System

Each asset element:

draggable=true

onDragStart

const payload = { type: "asset", assetType: "image", url:
"/assets/tokens/goblin.png" }

e.dataTransfer.setData( "application/json", JSON.stringify(payload) )

------------------------------------------------------------------------

# 6. Droppable Targets

Targets must read drag payload.

Example Canvas Drop

canvas.addEventListener("drop", (event) =\> {

const data = JSON.parse( event.dataTransfer.getData("application/json")
)

if (data.assetType === "image") { createToken(data.url) }

})

------------------------------------------------------------------------

# 7. File Types

image png jpg webp svg

audio mp3 wav ogg

video mp4 webm

json icons only

------------------------------------------------------------------------

# 8. Permissions

GM upload delete rename create folders

Players read only

------------------------------------------------------------------------

# 9. Performance Rules

Do NOT render full image grid.

Always load thumbnail.

Use lazy loading for folders \> 100 assets.

Use virtualized grid rendering.

------------------------------------------------------------------------

# 10. Optional Improvements

asset tags search zip import cloud storage auto token creation
