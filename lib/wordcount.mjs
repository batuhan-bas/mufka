// Pure word and character counts for the status bar, close to Obsidian's:
// the frontmatter is left out; words are runs of letters/digits (an apostrophe
// or hyphen inside a word keeps it one word); Markdown markers are not words.

export function countText(content) {
  let text = String(content == null ? '' : content);
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end !== -1) text = text.slice(text.indexOf('\n', end + 1) + 1 || text.length);
  }
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  return { words: words.length, characters: [...text].length };
}
