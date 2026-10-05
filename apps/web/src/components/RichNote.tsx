import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  List,
  ListOrdered,
  Link2,
  Code,
  CheckSquare,
  Quote,
} from 'lucide-react';
import type { BoardDocument, Card } from '@atelier/domain';
export function RichNote({
  card,
  board,
  readOnly,
}: {
  card: Card;
  board: BoardDocument;
  readOnly: boolean;
}) {
  const fragment = board.doc.getXmlFragment('rich:' + card.id);
  board.undoManager.trackedOrigins.add(ySyncPluginKey);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          link: { openOnClick: false },
          heading: { levels: [1, 2, 3] },
        }),
        Collaboration.configure({
          document: board.doc,
          field: 'rich:' + card.id,
          yUndoOptions: { undoManager: board.undoManager },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Escreva uma ideia…' }),
      ],
      editable: !readOnly,
      immediatelyRender: false,
      editorProps: {
        attributes: { 'aria-label': 'Conteúdo da nota', 'data-scrollable': 'true' },
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? board.redo() : board.undo();
            return true;
          }
          return false;
        },
      },
    },
    [card.id, board],
  );
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  useEffect(() => {
    if (!board.undoManager.scope.includes(fragment)) board.undoManager.addToScope(fragment);
  }, [board, fragment]);
  const link = () => {
    if (!editor) return;
    const url = window.prompt(
      'Endereço do link (https://)',
      editor.getAttributes('link').href ?? 'https://',
    );
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (/^https?:\/\//i.test(url)) editor.chain().focus().setLink({ href: url }).run();
  };
  return (
    <div className="rich-note" data-no-drag>
      {!readOnly && editor && (
        <div className="format-toolbar" role="toolbar" aria-label="Formatar nota">
          <button
            aria-label="Negrito"
            aria-pressed={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </button>
          <button
            aria-label="Itálico"
            aria-pressed={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </button>
          <button
            aria-label="Sublinhado"
            aria-pressed={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={14} />
          </button>
          <button
            aria-label="Título"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 size={14} />
          </button>
          <button
            aria-label="Lista"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={14} />
          </button>
          <button
            aria-label="Lista numerada"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={14} />
          </button>
          <button
            aria-label="Checklist"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <CheckSquare size={14} />
          </button>
          <button
            aria-label="Citação"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={14} />
          </button>
          <button
            aria-label="Código"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Code size={14} />
          </button>
          <button aria-label="Inserir link" onClick={link}>
            <Link2 size={14} />
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
