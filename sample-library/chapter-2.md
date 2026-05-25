# Chapter 2: Under the Hood

This chapter is for the curious. You do not need any of it to read your files,
but if you like knowing how things work, read on.

## How a document becomes pages

The Markdown text is converted to HTML and laid out in a tall, single column.
That column is then sliced into fixed-width pieces using CSS multi-column layout:
each "page" is exactly one column wide. To turn a page, the app simply shifts the
whole column sideways by one page width. Because the browser handles the text
flow, everything reflows correctly when you resize the window or change the font.

### Counting the pages

Once the column is laid out, the app measures its total width and divides by the
width of a single page. That gives the page count. When anything changes — window
size, font size, reading width — it measures again and recomputes.

## Where your settings live

Your theme and reading preferences, plus the last folder you opened and your
place in each file, are saved to a small JSON file in your user data directory.
Nothing leaves your computer; there is no account and no network.

## Keyboard shortcuts

- **Right arrow / Page Down / Space** — next page
- **Left arrow / Page Up** — previous page
- **Home** — first page
- **End** — last page

That is the whole tour. Head back to the [handbook](README.md) whenever you like.
