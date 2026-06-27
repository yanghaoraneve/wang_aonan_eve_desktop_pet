interface LyricIndex {
  items: LyricIndexItem[];
}

interface LyricIndexItem {
  id: number | string;
  name: string;
  album: string;
  artists: string[];
  filename: string;
  aliases: string[];
  charCount: number;
}

interface LyricDocument extends LyricIndexItem {
  cleanText: string;
}

interface ScoredLyric {
  item: LyricDocument;
  score: number;
  terms: string[];
}

let knowledgePromise: Promise<LyricDocument[]> | null = null;

export async function buildLocalKnowledgeContext(query: string): Promise<string> {
  const text = query.trim();
  if (!text) return "";

  const docs = await loadLyricKnowledge();
  if (docs.length === 0) return "";

  if (isSongListQuery(text)) {
    const songs = docs
      .filter((doc) => !doc.name.includes("伴奏"))
      .slice(0, 36)
      .map((doc) => `《${doc.name}》`)
      .join("、");
    return `\n\n本地王澳楠EVE歌曲知识库：\n可参考的歌曲包括：${songs}。\n如果用户问完整歌单，可以说明本地库里还有更多歌曲，并挑重点介绍。`;
  }

  const matches = scoreLyrics(text, docs).slice(0, 3);
  if (matches.length === 0 || matches[0].score < 8) return "";

  const entries = matches.map(({ item, terms }) => {
    const excerpt = buildExcerpt(item.cleanText, terms);
    return [
      `歌曲：《${item.name}》${item.album ? `，专辑/单曲：${item.album}` : ""}`,
      `艺人：${item.artists.join("、") || "王澳楠EVE"}`,
      excerpt ? `歌词片段摘要：${excerpt}` : "",
    ].filter(Boolean).join("\n");
  });

  return `\n\n本地歌词知识库召回：\n${entries.join("\n\n")}\n\n使用规则：这些内容只用于理解歌曲情绪和主题；不要输出大段歌词，最多短引用一句，并优先用自己的话概括。`;
}

async function loadLyricKnowledge(): Promise<LyricDocument[]> {
  if (!knowledgePromise) {
    knowledgePromise = loadLyricKnowledgeOnce().catch((error) => {
      console.warn("failed to load Xiaonan local knowledge", error);
      return [];
    });
  }
  return knowledgePromise;
}

async function loadLyricKnowledgeOnce(): Promise<LyricDocument[]> {
  const index = await fetchJson<LyricIndex>("/assets/eve-knowledge/lyric-index.json");
  const docs = await Promise.all(
    index.items.map(async (item) => {
      const raw = await fetchText(`/assets/eve-knowledge/lyrics/${encodeURIComponent(item.filename)}`);
      return {
        ...item,
        cleanText: cleanLyricText(raw),
      };
    }),
  );
  return docs.filter((doc) => doc.cleanText.length > 0);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function scoreLyrics(query: string, docs: LyricDocument[]): ScoredLyric[] {
  const normalizedQuery = normalize(query);
  const terms = extractTerms(query);

  return docs
    .map((item) => {
      const itemTerms = [...terms];
      let score = 0;
      const names = [item.name, ...item.aliases].filter(Boolean);
      for (const name of names) {
        const normalizedName = normalize(name);
        if (normalizedName && normalizedQuery.includes(normalizedName)) {
          score += 80;
          itemTerms.push(name);
        } else if (normalizedName && normalizedName.includes(normalizedQuery)) {
          score += 35;
        }
      }

      const normalizedText = normalize(item.cleanText);
      for (const term of terms) {
        const normalizedTerm = normalize(term);
        if (!normalizedTerm) continue;
        if (normalize(item.name).includes(normalizedTerm)) score += 20;
        if (normalizedText.includes(normalizedTerm)) score += 5;
      }

      if (isLyricQuery(query) && score > 0) score += 5;
      return { item, score, terms: uniqueTerms(itemTerms) };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

function cleanLyricText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\[[0-9:.]+\]\s*/, "")
        .replace(/^#.*$/, "")
        .replace(/^===.*===$/, "")
        .trim(),
    )
    .filter((line) => line && !/^(作词|作曲|编曲|混音|录音|封面|制作人)\s*:/.test(line))
    .join("\n");
}

function buildExcerpt(text: string, terms: string[]): string {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length === 0) return "";

  const normalizedTerms = terms.map(normalize).filter(Boolean);
  let start = 0;
  const hitIndex = lines.findIndex((line) => {
    const normalizedLine = normalize(line);
    return normalizedTerms.some((term) => normalizedLine.includes(term));
  });
  if (hitIndex >= 0) start = Math.max(0, hitIndex - 2);

  return lines.slice(start, start + 8).join(" / ").slice(0, 420);
}

function extractTerms(query: string): string[] {
  const quoted = Array.from(query.matchAll(/[《「“"]([^》」”"]{1,30})[》」”"]/g))
    .map((match) => match[1]);
  const words = query
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return uniqueTerms([...quoted, ...words]);
}

function uniqueTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isSongListQuery(query: string): boolean {
  return /歌单|歌曲列表|有哪些歌|有什么歌|作品列表|全部歌曲/.test(query);
}

function isLyricQuery(query: string): boolean {
  return /歌词|这首歌|哪首歌|歌曲|作品|专辑|唱的|写的|讲什么|表达什么|逐客令|让他走|拜托拜托|小气鬼|不快乐/.test(query);
}

const STOP_WORDS = new Set([
  "这个",
  "那个",
  "什么",
  "怎么",
  "为什么",
  "一下",
  "一些",
  "可以",
  "帮我",
  "讲讲",
  "说说",
]);
