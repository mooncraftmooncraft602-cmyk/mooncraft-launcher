import { motion } from "framer-motion";
import type { NewsEntry } from "@/types";
import { relativeTime, absoluteDate } from "@/utils/time";
import { Tooltip } from "@/components/Tooltip/Tooltip";
import "./NewsCard.css";

interface Props {
  entry: NewsEntry;
  index: number;
  onOpen?: (e: NewsEntry) => void;
}

const NEW_WINDOW_MS = 24 * 3600 * 1000;

export function NewsCard({ entry, index, onOpen }: Props) {
  const isNew = (() => {
    try { return Date.now() - new Date(entry.published_at).getTime() < NEW_WINDOW_MS; }
    catch { return false; }
  })();

  return (
    <motion.article
      className="news-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: "easeOut" }}
      onClick={() => onOpen?.(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(entry);
        }
      }}
    >
      {entry.image && (
        <div
          className="news-card__cover"
          style={{ backgroundImage: `url(${entry.image})` }}
        >
          {isNew && <span className="news-card__new">NEW</span>}
        </div>
      )}
      <div className="news-card__body">
        <div className="news-card__meta">
          {entry.tag && <span className="news-card__tag">{entry.tag}</span>}
          {!entry.image && isNew && <span className="news-card__new news-card__new--inline">NEW</span>}
          <Tooltip label={absoluteDate(entry.published_at)} side="top">
            <span className="news-card__date">{relativeTime(entry.published_at)}</span>
          </Tooltip>
        </div>
        <h3 className="news-card__title">{entry.title}</h3>
        {entry.subtitle && <p className="news-card__sub">{entry.subtitle}</p>}
        <p className="news-card__body-text">{truncate(entry.body, 180)}</p>
        <span className="news-card__more">Lire la transmission →</span>
      </div>
    </motion.article>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
