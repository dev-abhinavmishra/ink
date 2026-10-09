import React, { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import clsx from 'clsx';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote,
  Heading1, Heading2,
} from 'lucide-react';
import { useStore } from '../../store';
import { sanitizeDoc } from '../../lib/notes';

const WIKILINK_RE = /\[\[([^\][\n]+)\]\]/g;

/** Fresh keystrokes land wet — diluted and blurred — then dry into the page. */
const inkDryingPlugin: Plugin = new Plugin({
  key: new PluginKey('inkDrying'),
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      set = set.map(tr.mapping, tr.doc);
      if (!tr.docChanged || !useStore.getState().prefs.wetInk) return set;
      const fresh: Decoration[] = [];
      tr.steps.forEach((step, i) => {
        step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
          // Only small bursts count as "written" — a paste or import lands dry.
          if (newEnd - newStart === 0 || newEnd - newStart > 42) return;
          const rest = tr.mapping.slice(i + 1);
          const from = rest.map(newStart, -1);
          const to = rest.map(newEnd, 1);
          if (to <= from || to > tr.doc.content.size) return;
          try {
            if (!/\S/.test(tr.doc.textBetween(from, to))) return;
            fresh.push(Decoration.inline(from, to, { class: 'ink-wet' }));
          } catch { /* range raced with a later step — skip it */ }
        });
      });
      if (fresh.length) set = set.add(tr.doc, fresh);
      const all = set.find();
      if (all.length > 160) set = set.remove(all.slice(0, all.length - 160));
      return set;
    },
  },
  props: {
    decorations(state: EditorState): DecorationSet {
      return inkDryingPlugin.getState(state);
    },
  },
});

const InkDrying = Extension.create({
  name: 'inkDrying',
  addProseMirrorPlugins() {
    return [inkDryingPlugin];
  },
});

/** Renders [[note titles]] in fountain-blue and opens (or starts) the named page on click. */
const WikiLinks = Extension.create({
  name: 'wikiLinks',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinks'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              WIKILINK_RE.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = WIKILINK_RE.exec(node.text))) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, { class: 'wikilink' })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(view, pos) {
            const $pos = view.state.doc.resolve(pos);
            if (!$pos.parent.isTextblock) return false;
            // Doc positions count leaf nodes (a hardBreak takes one) that
            // textContent skips — translate parentOffset into a pure-text
            // offset so the match range check lines up.
            let textOffset = 0;
            $pos.parent.forEach((child, childOffset) => {
              if (childOffset < $pos.parentOffset && child.isText && child.text) {
                textOffset += Math.min(child.text.length, $pos.parentOffset - childOffset);
              }
            });
            WIKILINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = WIKILINK_RE.exec($pos.parent.textContent))) {
              if (textOffset >= match.index && textOffset <= match.index + match[0].length) {
                const title = match[1].trim();
                const { notes, setActiveNote, addNote } = useStore.getState();
                const target = notes.find(n => !n.trashedAt && n.title.trim().toLowerCase() === title.toLowerCase());
                if (target) setActiveNote(target.id);
                else addNote({ title });
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

interface RichEditorProps {
  content: string;
  onUpdate: (json: string, wordCount: number) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  onEditorReady?: (editor: Editor | null) => void;
  headingAnchors?: boolean;
  typewriter?: boolean;
}

/** Tag top-level headings with focus-heading-N ids, matching the outline's
 *  document order. Nested headings (e.g. inside a blockquote) get no anchor —
 *  the outline doesn't list them either. */
const assignHeadingIds = (dom: HTMLElement) => {
  dom.querySelectorAll('h1, h2, h3').forEach(h => h.removeAttribute('id'));
  let index = 0;
  for (const el of Array.from(dom.children)) {
    if (/^H[1-3]$/.test(el.tagName)) el.id = `focus-heading-${index++}`;
  }
};

/** Tag the top-level block holding the caret so typewriter mode can dim the rest. */
const markCurrentBlock = (editor: Editor) => {
  const dom = editor.view.dom;
  dom.querySelectorAll('.is-current').forEach(el => el.classList.remove('is-current'));
  try {
    const resolved = editor.view.domAtPos(editor.state.selection.$from.pos);
    let node = (resolved.node.nodeType === 3 ? resolved.node.parentElement : resolved.node) as HTMLElement | null;
    while (node && node.parentElement !== dom) node = node.parentElement;
    node?.classList?.add('is-current');
  } catch {
    // selection outside doc — leave unmarked
  }
};

export const RichEditor: React.FC<RichEditorProps> = ({
  content,
  onUpdate,
  placeholder = 'Begin.',
  editable = true,
  className = '',
  onEditorReady,
  headingAnchors = false,
  typewriter = false,
}) => {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Editor callbacks are bound once at creation — read live values from a ref.
  const latest = useRef({ typewriter, headingAnchors, editable, onUpdate });
  useEffect(() => {
    latest.current = { typewriter, headingAnchors, editable, onUpdate };
  });

  const parsedContent = sanitizeDoc(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Typography,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      WikiLinks,
      InkDrying,
    ],
    content: parsedContent,
    editable,
    editorProps: {
      attributes: {
        class: `max-w-none focus:outline-none min-h-[200px] ${className}`,
        spellcheck: 'false',
      },
    },
    onSelectionUpdate: ({ editor }) => {
      if (latest.current.typewriter) markCurrentBlock(editor);
    },
    onCreate: ({ editor }) => {
      if (latest.current.typewriter) markCurrentBlock(editor);
    },
    onUpdate: ({ editor }) => {
      const { typewriter, headingAnchors, editable, onUpdate } = latest.current;
      if (typewriter) markCurrentBlock(editor);
      if (headingAnchors) assignHeadingIds(editor.view.dom);
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(JSON.stringify(editor.getJSON()), editor.storage.characterCount.words());
      }, 400);
    },
  });

  useEffect(() => {
    onEditorReady?.(editor);
    if (editor && headingAnchors) assignHeadingIds(editor.view.dom);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady, headingAnchors]);

  // On unmount, flush any pending save so the last keystrokes aren't lost.
  useEffect(() => () => {
    if (debounceRef.current && editor) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const { editable, onUpdate } = latest.current;
      if (editable) onUpdate(JSON.stringify(editor.getJSON()), editor.storage.characterCount.words());
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={clsx('relative', typewriter && 'typewriter')}>
      {editable && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          className="flex items-center gap-0.5 px-1.5 py-1.5 bg-ink rounded-md shadow-pop"
        >
          <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={Bold} title="Bold" />
          <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={Italic} title="Italic" />
          <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} icon={Strikethrough} title="Strike" />
          <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} icon={Code} title="Code" />
          <span className="w-px h-4 bg-paper/15 mx-1" />
          <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} icon={Heading1} title="Heading" />
          <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={Heading2} title="Subheading" />
          <span className="w-px h-4 bg-paper/15 mx-1" />
          <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={List} title="List" />
          <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={ListOrdered} title="Numbered list" />
          <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} icon={Quote} title="Quote" />
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />
    </div>
  );
};

const Btn: React.FC<{
  active?: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
}> = ({ active, onClick, icon: Icon, title }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={clsx(
      'w-7 h-7 rounded-sm flex items-center justify-center transition-colors',
      active ? 'bg-paper/15 text-paper' : 'text-paper/55 hover:text-paper hover:bg-paper/10'
    )}
  >
    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
  </button>
);
