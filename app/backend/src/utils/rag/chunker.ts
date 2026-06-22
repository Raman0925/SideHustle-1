import { TokenBudgetManager } from '../tokens/tokenBudgetManager.js';

export interface ChunkOptions {
  maxTokens: number;      // max tokens per chunk, default 512
  overlapTokens: number;  // overlap between chunks, default 50
}

export interface Chunk {
  text: string;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

export interface Chunker {
  chunk(text: string): Chunk[];
}

export function createChunker(
  tokenManager: TokenBudgetManager,
  options?: Partial<ChunkOptions>
): Chunker {
  const finalOptions = {
    maxTokens: options?.maxTokens ?? 512,
    overlapTokens: options?.overlapTokens ?? 50
  };

  function chunk(text: string): Chunk[] {
    if (!text) return [];

    // 1. Split into paragraphs with exact position tracking
    const paragraphs: { text: string; start: number; end: number }[] = [];
    let index = 0;
    const rawParagraphs = text.split(/(\n\n)/);
    for (const part of rawParagraphs) {
      if (part === '\n\n') {
        index += part.length;
        continue;
      }
      if (part.length > 0) {
        paragraphs.push({
          text: part,
          start: index,
          end: index + part.length
        });
        index += part.length;
      }
    }

    // 2. Sentence splitting for large paragraphs
    const segments: { text: string; start: number; end: number }[] = [];
    for (const para of paragraphs) {
      const paraTokens = tokenManager.getTokenCount(para.text);
      if (paraTokens <= finalOptions.maxTokens) {
        segments.push(para);
      } else {
        const rawSentences = para.text.split(/([.!?]\s+)/);
        let offset = 0;
        for (let i = 0; i < rawSentences.length; i++) {
          const part = rawSentences[i];
          if (i % 2 === 1) {
            if (segments.length > 0) {
              const last = segments[segments.length - 1];
              last.text += part;
              last.end += part.length;
            } else {
              offset += part.length;
            }
          } else {
            if (part.length > 0) {
              segments.push({
                text: part,
                start: para.start + offset,
                end: para.start + offset + part.length
              });
            }
            offset += part.length;
          }
        }
      }
    }

    // 3. Pre-accumulate words into sub-sentence chunks to avoid creating tiny single-word segments
    const finalSegments: { text: string; start: number; end: number }[] = [];
    for (const seg of segments) {
      const segTokens = tokenManager.getTokenCount(seg.text);
      if (segTokens <= finalOptions.maxTokens) {
        finalSegments.push(seg);
      } else {
        const words = seg.text.split(/(\s+)/);
        let offset = 0;
        let currentGroup = "";
        let groupStart = seg.start;

        for (let i = 0; i < words.length; i += 2) {
          const word = words[i];
          const separator = words[i + 1] || '';
          const wordText = word + separator;

          if (wordText.length > 0) {
            const candidate = currentGroup + wordText;
            const candidateTokens = tokenManager.getTokenCount(candidate);

            if (candidateTokens > finalOptions.maxTokens) {
              if (currentGroup.length > 0) {
                finalSegments.push({
                  text: currentGroup,
                  start: groupStart,
                  end: seg.start + offset
                });
              }
              currentGroup = wordText;
              groupStart = seg.start + offset;
            } else {
              currentGroup = candidate;
            }
            offset += wordText.length;
          }
        }

        if (currentGroup.length > 0) {
          finalSegments.push({
            text: currentGroup,
            start: groupStart,
            end: seg.start + offset
          });
        }
      }
    }

    // 4. Group segments into overlapping chunks
    const chunks: Chunk[] = [];
    let i = 0;

    while (i < finalSegments.length) {
      let currentText = "";
      let startChar = finalSegments[i].start;
      let endChar = finalSegments[i].end;
      let j = i;

      while (j < finalSegments.length) {
        const nextSegment = finalSegments[j];
        const candidateText = currentText ? currentText + nextSegment.text : nextSegment.text;
        const candidateTokens = tokenManager.getTokenCount(candidateText);

        if (candidateTokens > finalOptions.maxTokens) {
          break;
        }

        currentText = candidateText;
        endChar = nextSegment.end;
        j++;
      }

      chunks.push({
        text: currentText,
        startChar,
        endChar,
        tokenCount: tokenManager.getTokenCount(currentText)
      });

      if (j === finalSegments.length) {
        break;
      }

      // Back-step to calculate start index `i` of next chunk to achieve overlap
      let k = j - 1;
      let overlapText = "";
      while (k >= i) {
        const segmentText = finalSegments[k].text;
        const candidateOverlap = overlapText ? segmentText + overlapText : segmentText;
        if (tokenManager.getTokenCount(candidateOverlap) > finalOptions.overlapTokens) {
          break;
        }
        overlapText = candidateOverlap;
        k--;
      }

      const nextStart = k + 1;
      if (nextStart <= i) {
        i = i + 1;
      } else {
        i = nextStart;
      }
    }

    return chunks;
  }

  return { chunk };
}
