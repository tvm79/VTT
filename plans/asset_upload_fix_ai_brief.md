# Fix Asset Upload Routing (AI Implementation Brief)

## Issue

Uploaded files are placed in incorrect folders because the current
logic: 1. Prioritizes the **currently open folder** (`currentPath`) 2.
Uses **only the first uploaded file** to determine destination 3. Uses
**first-match MIME rules**, causing all `image/*` files to match
`/tokens`

Result: most images end up in `/tokens` regardless of type.

## Required Behavior

Routing must be **type-first**, not **folder-first**.

Each file must be evaluated independently.

## Correct Routing Rules

| MIME / Extension \| Destination \|

\|------------------\|-------------\| audio/\* \| /audio \| \| video/\*
\| /maps \| \| image/\* \| depends on asset type (default /tokens) \| \|
.pdf .json .txt \| /handouts \|

## Critical Rules

1.  Determine destination **per file**
2.  Do NOT use `selectedFiles[0]`
3.  Current folder must **never override root folder**
4.  Current folder may only affect **subfolder placement**
5.  Remove reliance on `findCompatibleFolder()` for primary routing

## Correct Upload Flow

    for each file in selectedFiles:

        if file.type startsWith "audio/":
            root = "/audio"

        else if file.type startsWith "video/":
            root = "/maps"

        else if file.type startsWith "image/":
            root = "/tokens"   # default image destination

        else if extension in [pdf,json,txt]:
            root = "/handouts"

        else:
            root = "/handouts"

        uploadPath = root
        upload(file, uploadPath)

## Implementation Target

Modify the function:

    uploadFiles()

Changes required:

-   Compute `uploadPath` **inside the loop**
-   Determine path **per file**
-   Do not base routing on `currentPath`
-   Upload each file independently

## Expected Outcome

Examples:

    map.webp  -> /maps
    token.png -> /tokens
    music.mp3 -> /audio
    notes.pdf -> /handouts

Uploads must produce the same result regardless of the currently open
folder.
