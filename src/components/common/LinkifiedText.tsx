import React from "react";
import { ExternalLink, FileText } from "lucide-react";
import { openTab } from "siyuan";
import type { App } from "siyuan";

interface LinkifiedTextProps {
  text?: string;
  className?: string;
  siyuanApp?: App;
}

// 1. Markdown link: [text](url) -> group 1: label, group 2: url
// 2. SiYuan block ref: ((id "optional title")) -> group 3: blockId, group 4: title
// 3. Plain URL: https://... or http://... or siyuan://... -> group 5: raw url
const COMBINED_LINK_REGEX =
  /(?:\[([^\]]+)\]\(((?:https?:\/\/|siyuan:\/\/|mailto:)[^\s)]+)\))|(?:\(\(([a-zA-Z0-9_-]{10,})(?:\s+["']([^"']*)["'])?\)\))|((?:https?:\/\/|siyuan:\/\/)[^\s<]+[^<.,:;"')\]\s])/gi;

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  text,
  className,
  siyuanApp,
}) => {
  if (!text) return null;

  const getEffectiveApp = (): App | undefined => {
    return siyuanApp || (window as unknown as { siyuan?: { app?: App } }).siyuan?.app;
  };

  const handleOpenBlock = (blockId: string) => {
    const app = getEffectiveApp();
    const cleanId = blockId.replace(/^\(\(/, "").replace(/\)\)$/, "").trim();
    if (app && cleanId) {
      openTab({
        app,
        doc: { id: cleanId },
      });
    } else {
      window.open(`siyuan://blocks/${cleanId}`, "_self");
    }
  };

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  COMBINED_LINK_REGEX.lastIndex = 0;

  while ((match = COMBINED_LINK_REGEX.exec(text)) !== null) {
    const matchIndex = match.index;

    // Push preceding plain text
    if (matchIndex > lastIndex) {
      elements.push(text.slice(lastIndex, matchIndex));
    }

    if (match[1] && match[2]) {
      // Markdown link: [label](url)
      const label = match[1];
      const url = match[2];
      const isExternal = url.startsWith("http://") || url.startsWith("https://");
      const isSiyuanBlock = url.startsWith("siyuan://blocks/");

      elements.push(
        <a
          key={`md-${matchIndex}`}
          href={url}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (isSiyuanBlock) {
              e.preventDefault();
              const blockId = url.replace("siyuan://blocks/", "").split("?")[0];
              handleOpenBlock(blockId);
            } else if (isExternal) {
              e.preventDefault();
              window.open(url, "_blank");
            }
          }}
        >
          <span>{label}</span>
          {isExternal && <ExternalLink className="h-3 w-3 inline shrink-0 opacity-75" />}
          {isSiyuanBlock && <FileText className="h-3 w-3 inline shrink-0 opacity-75" />}
        </a>
      );
    } else if (match[3]) {
      // SiYuan block reference: ((blockId "anchor"))
      const blockId = match[3];
      const label = match[4] || `Block ${blockId.slice(0, 8)}…`;

      elements.push(
        <span
          key={`block-${matchIndex}`}
          role="button"
          tabIndex={0}
          className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer bg-primary/10 px-1 py-0.5 rounded text-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenBlock(blockId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              handleOpenBlock(blockId);
            }
          }}
          title={`Open SiYuan block: ${blockId}`}
        >
          <FileText className="h-3 w-3 inline shrink-0 opacity-80" />
          <span>{label}</span>
        </span>
      );
    } else if (match[5]) {
      // Plain URL
      const url = match[5];
      const isExternal = url.startsWith("http://") || url.startsWith("https://");
      const isSiyuanBlock = url.startsWith("siyuan://blocks/");

      elements.push(
        <a
          key={`url-${matchIndex}`}
          href={url}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer break-all"
          onClick={(e) => {
            e.stopPropagation();
            if (isSiyuanBlock) {
              e.preventDefault();
              const blockId = url.replace("siyuan://blocks/", "").split("?")[0];
              handleOpenBlock(blockId);
            } else if (isExternal) {
              e.preventDefault();
              window.open(url, "_blank");
            }
          }}
        >
          <span>{url}</span>
          {isExternal && <ExternalLink className="h-3 w-3 inline shrink-0 opacity-75" />}
          {isSiyuanBlock && <FileText className="h-3 w-3 inline shrink-0 opacity-75" />}
        </a>
      );
    }

    lastIndex = matchIndex + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <span className={className}>{elements}</span>;
};
