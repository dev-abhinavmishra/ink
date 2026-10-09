import React, { useState, useRef, useMemo } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useStore } from '../../store';
import { RichEditor } from '../editor/RichEditor';
import { findBacklinks, noteToMarkdown, downloadFile, slugify } from '../../lib/notes';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, FolderOpen, Pin, Copy, FileDown, Link2, Trash2,
  MoreHorizontal, Plus, CornerLeftUp, Droplet,
} from 'lucide-react';
import { InkDrop, PenRest, Spatter, Squiggle, TornEdge } from '../../lib/ink';

type SaveState = 'idle' | 'saving' | 'saved';

export const Editor: React.FC = () => {
  const {
    activeNoteId, notes, updateNote, updateNoteFolder, folders, setNoteTags,
    togglePin, duplicateNote, trashNote, setActiveNote, prefs,
  } = useStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagValue, setTagValue] = useState('');
  const [dropLanded, setDropLanded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!activeNote) { setDropLanded(false); return; }
    const fresh = activeNote.wordCount === 0 && Date.now() - activeNote.createdAt < 20000;
    if (!fresh) { setDropLanded(false); return; }
    setDropLanded(true);
    const t = setTimeout(() => setDropLanded(false), 1700);
    return () => clearTimeout(t);
  }, [activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const backlinks = useMemo(
    () => (activeNote ? findBacklinks(notes, activeNote.title || '') : []),
    [notes, activeNote]
  );

  const triggerSave = () => {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    }, 700);
  };

  const handleContentUpdate = (json: string, wordCount: number) => {
    if (!activeNote) return;
    updateNote(activeNote.id, { content: json, wordCount });
    triggerSave();
  };

  const insertWikiLink = (title: string) => {
    editor?.chain().focus().insertContent(`[[${title}]]`).run();
    setLinkPickerOpen(false);
  };

  const submitTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = tagValue.trim().replace(/^#/, '').toUpperCase();
    if (tag && activeNote && !activeNote.tags.includes(tag)) {
      setNoteTags(activeNote.id, [...activeNote.tags, tag]);
    }
    setTagValue('');
    setTagInputOpen(false);
  };

  const liveNotes = notes.filter(n => !n.trashedAt && n.id !== activeNote?.id);

  const editorClasses = clsx(
    prefs.editorTextSize !== 'md' && `pref-text-${prefs.editorTextSize}`
  );

  return (
    <div className={clsx(
      'flex-col overflow-hidden',
      activeNote
        ? 'fixed inset-0 z-[60] flex md:static md:z-auto md:flex-1'
        : 'hidden md:flex md:flex-1'
    )}>
      {!activeNote ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-desk">
          <PenRest className="w-32 h-16 opacity-80" />
          <p className="font-serif text-xl text-ink-faint">Pick a page, or start a new one.</p>
          <p className="font-mono text-2xs text-ink-ghost">⌘K — search everything</p>
        </div>
      ) : (
        <section className="flex-1 flex flex-col relative md:m-3 sheet paper-grain overflow-hidden">
          {/* deckle edge — the sheet was torn from the pad */}
          <TornEdge seed={activeNote.id} className="hidden md:block w-full h-[9px] -mt-px flex-shrink-0 relative z-[2]" />

          {/* Sheet header — desk tools */}
          <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-3 border-b border-line flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setActiveNote(null)}
                className="md:hidden w-8 h-8 -ml-2 flex items-center justify-center rounded text-ink-faint hover:text-ink"
                aria-label="Back to list"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink transition-colors px-1.5 py-1 rounded hover:bg-paper-dim cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                <select
                  aria-label="Move note to folder"
                  value={activeNote.folder}
                  onChange={event => updateNoteFolder(activeNote.id, event.target.value)}
                  className="bg-transparent border-0 p-0 pr-4 text-xs font-medium focus:ring-0 cursor-pointer text-ink-soft"
                >
                  {folders.map(folder => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
                  {!folders.some(folder => folder.name === activeNote.folder) && <option value={activeNote.folder}>{activeNote.folder}</option>}
                </select>
              </label>

              <div className="hidden sm:flex items-center gap-1 flex-wrap">
                {activeNote.tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setNoteTags(activeNote.id, activeNote.tags.filter(v => v !== tag))}
                    title={`Remove ${tag}`}
                    className="group font-mono text-2xs text-fountain hover:text-pencil transition-colors"
                  >
                    #{tag.toLowerCase()}<span className="opacity-0 group-hover:opacity-100"> ×</span>
                  </button>
                ))}
                {tagInputOpen ? (
                  <form onSubmit={submitTag} className="flex items-center">
                    <input
                      autoFocus
                      value={tagValue}
                      onChange={e => setTagValue(e.target.value)}
                      onBlur={() => setTagInputOpen(false)}
                      placeholder="tag"
                      className="w-16 font-mono text-2xs bg-paper-dim border-0 rounded-sm px-1.5 py-0.5 focus:ring-0"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    aria-label="Add tag"
                    onClick={() => setTagInputOpen(true)}
                    className="w-5 h-5 flex items-center justify-center rounded-sm text-ink-ghost hover:text-ink hover:bg-paper-dim transition-colors"
                  >
                    <Plus className="w-3 h-3" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SaveIndicator state={saveState} />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(open => !open)}
                  aria-label="Note actions"
                  className="w-8 h-8 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1 z-50 w-52 bg-paper border border-line rounded shadow-pop py-1"
                      >
                        <MenuItem icon={Pin} label={activeNote.isPinned ? 'Unpin' : 'Pin to top'} onClick={() => { togglePin(activeNote.id); setMenuOpen(false); }} />
                        <MenuItem icon={Copy} label="Carbon copy" onClick={() => { duplicateNote(activeNote.id); setMenuOpen(false); }} />
                        <MenuItem icon={Link2} label="Link to a note…" onClick={() => { setMenuOpen(false); setLinkPickerOpen(true); }} />
                        <MenuItem icon={FileDown} label="Export as Markdown" onClick={() => { downloadFile(`${slugify(activeNote.title)}.md`, noteToMarkdown(activeNote)); setMenuOpen(false); }} />
                        <div className="h-px bg-line my-1" />
                        <MenuItem icon={Trash2} label="Move to trash" danger onClick={() => { trashNote(activeNote.id); setMenuOpen(false); }} />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* The page */}
          <div className={clsx('flex-1 overflow-y-auto custom-scrollbar', editorClasses)}>
            <div className="max-w-[42rem] mx-auto w-full px-6 md:px-10 pt-10 pb-40">
              <div className="relative">
                {dropLanded && <span className="absolute -left-1 -top-3"><InkDrop seed={activeNote.id} size={30} /></span>}
                <input
                  className="w-full font-serif text-[2.1rem] md:text-[2.4rem] font-semibold text-ink border-none focus:ring-0 p-0 mb-1 placeholder:text-ink-ghost/50 leading-[1.15] tracking-[-0.015em] bg-transparent"
                  type="text"
                  value={activeNote.title}
                  onChange={e => { updateNote(activeNote.id, { title: e.target.value }); triggerSave(); }}
                  placeholder="Untitled"
                  aria-label="Note title"
                />
                <Squiggle key={activeNote.id} seed={`title:${activeNote.id}`} width={180} color="var(--color-ink-ghost)" className="block opacity-50 mb-3" draw />
              </div>

              <div className="flex items-center gap-x-4 gap-y-1 mb-8 font-mono text-2xs text-ink-ghost flex-wrap">
                <span>edited {formatDistanceToNow(activeNote.lastModified, { addSuffix: true })}</span>
                <span>{activeNote.wordCount || 0} words</span>
                <span>{Math.max(1, Math.ceil((activeNote.wordCount || 0) / 220))} min read</span>
                <span>written {format(activeNote.createdAt, 'MMM d')}</span>
              </div>

              <RichEditor
                key={activeNote.id}
                onEditorReady={setEditor}
                content={activeNote.content}
                onUpdate={handleContentUpdate}
                placeholder="Begin."
              />
            </div>
          </div>

          {/* Backlinks — bottom-left drawer, only when they exist */}
          <AnimatePresence>
            {backlinks.length > 0 && (
              <BacklinksTray backlinks={backlinks} onOpen={id => { setActiveNote(id); }} />
            )}
          </AnimatePresence>

          {/* Link picker popover */}
          <AnimatePresence>
            {linkPickerOpen && (
              <>
                <div className="fixed inset-0 z-[70]" onClick={() => setLinkPickerOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[71] w-72 bg-paper border border-line rounded shadow-pop overflow-hidden"
                >
                  <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-medium text-ink-ghost">Link to a note — inserts [[title]]</p>
                  <div className="max-h-56 overflow-y-auto pb-1.5 custom-scrollbar">
                    {liveNotes.length === 0 && <p className="px-3.5 py-2 text-[13px] text-ink-faint">No other notes yet.</p>}
                    {liveNotes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => insertWikiLink(note.title || 'Untitled')}
                        className="w-full text-left px-3.5 py-2 text-[13px] font-serif text-ink hover:bg-paper-dim truncate transition-colors"
                      >
                        {note.title || 'Untitled'}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* A few flecks the nib threw, dried into the corner */}
          <Spatter seed={activeNote.id} size={90} className="absolute bottom-24 right-6 md:right-10 pointer-events-none z-[2]" opacity={0.28} />

          {/* Ink toolbar */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-1.5 bg-ink rounded-md shadow-pop z-30">
            <ToolbarButton editor={editor} icon="format_bold" title="Bold" onAction={e => e.chain().focus().toggleBold().run()} />
            <ToolbarButton editor={editor} icon="format_italic" title="Italic" onAction={e => e.chain().focus().toggleItalic().run()} />
            <div className="w-px h-4 bg-paper/15 mx-1" />
            <ToolbarButton editor={editor} icon="format_list_bulleted" title="List" onAction={e => e.chain().focus().toggleBulletList().run()} />
            <ToolbarButton editor={editor} icon="format_quote" title="Quote" onAction={e => e.chain().focus().toggleBlockquote().run()} />
            <ToolbarButton editor={editor} icon="code" title="Code" onAction={e => e.chain().focus().toggleCode().run()} />
            <div className="w-px h-4 bg-paper/15 mx-1" />
            <button
              type="button"
              title="Link to a note"
              aria-label="Link to a note"
              onClick={() => setLinkPickerOpen(true)}
              className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 transition-colors"
            >
              <Link2 className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={clsx(
      'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
      danger ? 'text-pencil hover:bg-pencil-wash' : 'text-ink-soft hover:bg-paper-dim hover:text-ink'
    )}
  >
    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
    {label}
  </button>
);

const BacklinksTray: React.FC<{ backlinks: { id: string; title: string }[]; onOpen: (id: string) => void }> = ({ backlinks, onOpen }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-5 left-5 z-30 hidden md:block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-2xs font-mono text-ink-faint bg-paper border border-line rounded px-2.5 py-1.5 hover:text-ink transition-colors shadow-sm"
      >
        <CornerLeftUp className="w-3 h-3" strokeWidth={1.75} />
        {backlinks.length} {backlinks.length === 1 ? 'link' : 'links'} here
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-1.5 w-64 bg-paper border border-line rounded shadow-pop overflow-hidden"
          >
            <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-medium text-ink-ghost">Mentioned in</p>
            <div className="pb-1.5 max-h-52 overflow-y-auto custom-scrollbar">
              {backlinks.map(note => (
                <button
                  key={note.id}
                  onClick={() => onOpen(note.id)}
                  className="w-full text-left px-3.5 py-2 text-[13px] font-serif text-ink hover:bg-paper-dim truncate transition-colors"
                >
                  {note.title || 'Untitled'}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ToolbarButton: React.FC<{
  editor: TiptapEditor | null;
  icon: string;
  title: string;
  onAction: (editor: TiptapEditor) => void;
}> = ({ editor, icon, title, onAction }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={!editor}
    onMouseDown={event => event.preventDefault()}
    onClick={() => editor && onAction(editor)}
    className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 disabled:opacity-30 transition-colors"
  >
    <ToolbarGlyph icon={icon} />
  </button>
);

// Tiny inline glyphs, hand-drawn weight — no icon font needed in the toolbar.
const ToolbarGlyph: React.FC<{ icon: string }> = ({ icon }) => {
  const props = { className: 'w-4 h-4', strokeWidth: 2, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icon) {
    case 'format_bold':
      return <span className="font-serif font-bold text-[15px] leading-none">B</span>;
    case 'format_italic':
      return <span className="font-serif italic text-[15px] leading-none">I</span>;
    case 'format_list_bulleted':
      return <svg viewBox="0 0 24 24" {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>;
    case 'format_quote':
      return <span className="font-serif font-bold text-[17px] leading-none -mt-0.5">”</span>;
    case 'code':
      return <svg viewBox="0 0 24 24" {...props}><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></svg>;
    default:
      return null;
  }
};

const SaveIndicator: React.FC<{ state: SaveState }> = ({ state }) => (
  <AnimatePresence mode="wait">
    {state === 'saving' && (
      <motion.span
        key="saving"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-1.5 font-mono text-2xs text-ink-ghost pr-1"
      >
        <motion.span
        className="w-1.5 h-1.5 rounded-full bg-fountain"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ repeat: Infinity, duration: 0.9 }}
      />
      ink wet
    </motion.span>
    )}
    {state === 'saved' && (
      <motion.span
        key="saved"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-1 font-mono text-2xs text-ink-ghost pr-1"
      >
        <Droplet className="w-3 h-3 text-ink-ghost" strokeWidth={2.5} />
        ink dry
      </motion.span>
    )}
  </AnimatePresence>
);
