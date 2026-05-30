import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import type { NewsEntry } from "@/types";
import { NewsCard } from "@/components/NewsCard/NewsCard";
import { Modal } from "@/components/Modal/Modal";
import { renderMarkdown } from "@/utils/markdown";
import { relativeTime, absoluteDate } from "@/utils/time";
import { play } from "@/utils/sounds";
import "./News.css";

export function News() {
  const [entries, setEntries] = useState<NewsEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [open, setOpen] = useState<NewsEntry | null>(null);

  useEffect(() => {
    api.getNews()
      .then((list) => {
        setEntries(list);
        if (list.length > 0) play("transmission");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // ⌘/Ctrl + K focuses the search input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("news-search-input") as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    entries?.forEach((e) => { if (e.tag) set.add(e.tag); });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (activeTag && e.tag !== activeTag) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.subtitle ?? "").toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
      );
    });
  }, [entries, search, activeTag]);

  return (
    <div className="news-screen">
      <header className="news-screen__head">
        <div>
          <h1>Communications</h1>
          <p>Server-side dispatches and patch notes from mission control.</p>
        </div>
        <div className="news-screen__search">
          <span className="news-screen__search-icon" aria-hidden>⌕</span>
          <input
            id="news-search-input"
            type="search"
            placeholder="Chercher une transmission…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className="news-screen__kbd">Ctrl + K</kbd>
        </div>
      </header>

      {tags.length > 0 && (
        <div className="news-screen__chips">
          <button
            type="button"
            className={`news-chip ${!activeTag ? "is-active" : ""}`}
            onClick={() => setActiveTag(null)}
          >
            Tous
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={`news-chip ${activeTag === t ? "is-active" : ""}`}
              onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {!entries && !error && (
        <div className="news-screen__loading">Receiving signal…</div>
      )}
      {error && (
        <div className="news-screen__loading news-screen__loading--err">
          Failed to load: {error}
        </div>
      )}
      {entries && entries.length === 0 && (
        <div className="news-screen__loading">No transmissions yet.</div>
      )}
      {entries && entries.length > 0 && filtered.length === 0 && (
        <div className="news-screen__loading">Aucun résultat pour cette recherche.</div>
      )}

      <div className="news-screen__grid">
        {filtered.map((e, i) => (
          <NewsCard key={e.id} entry={e} index={i} onOpen={(x) => setOpen(x)} />
        ))}
      </div>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="wide"
        title={open?.title}
      >
        {open && (
          <article className="news-modal">
            {open.image && (
              <div
                className="news-modal__cover"
                style={{ backgroundImage: `url(${open.image})` }}
              />
            )}
            <div className="news-modal__meta">
              {open.tag && <span className="news-modal__tag">{open.tag}</span>}
              <span
                className="news-modal__date"
                title={absoluteDate(open.published_at)}
              >
                {relativeTime(open.published_at)} · {absoluteDate(open.published_at)}
              </span>
            </div>
            {open.subtitle && <p className="news-modal__sub">{open.subtitle}</p>}
            <div className="md" dangerouslySetInnerHTML={renderMarkdown(open.body)} />
          </article>
        )}
      </Modal>
    </div>
  );
}
