---
title: Media Showcase
tags: [demo, images]
---

# Media Showcase

## Images with captions

Add a caption with the title syntax — `![alt](path "Caption")` — and it renders as a figure caption under the image.

## Resize with a width hint

Use `![alt|width]` or `![alt|widthxheight]` to size an image, e.g. `![diagram|320](assets/diagram.png)`.

## Drag & drop

Drop or paste an image into the **editor** and it's saved into an `assets/` folder beside the note, with the Markdown link inserted automatically. Click any image to open the zoom viewer (with **Copy path** / **Open in Explorer** for local files).

## Inline example

![sample|160](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgcng9IjEwIiBmaWxsPSIjNGE5MGQ5Ii8+PHRleHQgeD0iMTAwIiB5PSI2OCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjIiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlNhbXBsZTwvdGV4dD48L3N2Zz4= "Figure 1 — an inline sample image")

## Missing images degrade gracefully

A link to a file that doesn't exist shows a clean warning instead of a broken icon:

![architecture diagram](assets/does-not-exist.png)
