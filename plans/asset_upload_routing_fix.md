# Asset Upload Routing Fix Instructions

## Problem Summary

Files are not being placed in the correct folders because the upload
logic prioritizes the **currently open folder** instead of the **file
type**.\
Additionally, only the first uploaded file is inspected and folder
matching is based on overly broad MIME rules.

## Root Causes

### 1. Folder-first routing

Current logic:

1.  Determine current folder from `currentPath`
2.  Check if that folder accepts the file
3.  If yes → upload there
4.  If no → search for compatible folder

Because many folders accept `image/*`, images get routed to whichever
folder is currently open.

### 2. Only the first file is analyzed

The code determines the upload path using:

`const firstFile = selectedFiles[0];`

All files then inherit that path. Mixed uploads therefore route
incorrectly.

### 3. First-match folder resolution

`findCompatibleFolder()` returns the first folder whose `accepts` rule
matches.

Because folder definitions are:

-   tokens → image/\*
-   maps → image/*,video/*
-   portraits → image/\*
-   items → image/\*

Every image matches `tokens` first.

## Correct Architecture

Uploads must be **type-first**, not **folder-first**.

### Correct logic flow

For each uploaded file:

1.  Detect MIME type
2.  Determine asset category
3.  Choose correct root folder
4.  Apply current subfolder if compatible
5.  Upload

Pseudo logic:

    for each file:
        detect type

        if audio:
            root = /audio
        else if video:
            root = /maps
        else if image:
            determine asset category or default folder
        else:
            root = /handouts

        upload to root or root + subfolder

### Important rule

The **current folder should never override type routing**.

Example:

Current path:

    /maps/caves

Upload:

    music.mp3

Correct destination:

    /audio/music.mp3

Not:

    /maps/caves/music.mp3

## Implementation Requirements

The AI must modify `uploadFiles()` so that:

1.  Upload path is determined **per file**
2.  Routing is **type-based**
3.  Current folder only affects **subfolders**, not root folder
4.  `findCompatibleFolder()` is not used for primary routing
5.  Mixed file uploads route each file independently

## Expected Result

  File Type      Destination
  -------------- -------------
  image token    /tokens
  image map      /maps
  portrait       /portraits
  item image     /items
  audio          /audio
  pdf/json/txt   /handouts
  video          /maps

Each file must be evaluated independently and uploaded to the correct
folder regardless of the currently open folder.
