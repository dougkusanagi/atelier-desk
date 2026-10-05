import { useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Folder,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  Search,
  Square,
  Undo2,
} from 'lucide-react';
import { type CardType, screenToWorld } from '@atelier/domain';
import { Canvas } from './features/canvas/Canvas';
import { demoBoard } from './features/canvas/demo';
import { BasicCard } from './components/BasicCard';
import { useCanvas } from './features/canvas/state';
export default function App() {
  const board = useMemo(demoBoard, []),
    toast = useCanvas((s) => s.toast);
  const { setSelected, notify } = useCanvas.getState();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useCanvas.setState({ toast: null }), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  const add = (type: CardType) => {
    const state = useCanvas.getState(),
      at = state.pointer ?? screenToWorld({ x: 440, y: 240 }, state.camera);
    setSelected([board.add(type, at)]);
  };
  return (
    <div className="app-shell">
      <aside className="workspace-sidebar">
        <div className="brand">
          <span className="brand-symbol">
            <Square size={18} />
            <span />
          </span>
          <span>
            atelier<span className="brand-dot">.</span>
          </span>
        </div>
        <button className="workspace-button">
          <span className="workspace-avatar">E</span>
          <span>
            Estúdio criativo<small>Espaço pessoal</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Navegação principal">
          <button
            className="nav-item active"
            onClick={() => notify('Você está no seu quadro de demonstração')}
          >
            <LayoutDashboard size={17} />
            Meus quadros<span>1</span>
          </button>
          <button
            className="nav-item"
            onClick={() => notify('Crie notas pelo menu à esquerda para capturar suas ideias')}
          >
            <Folder size={17} />
            Não organizados
          </button>
        </nav>
        <div className="sidebar-section">
          <span>QUADROS RECENTES</span>
          <button className="board-nav active">
            <span className="board-nav-icon">P</span>Campanha de primavera
          </button>
        </div>
        <div className="sidebar-note">
          <span className="mini-squares">
            <i />
            <i />
            <i />
          </span>
          <p>
            Um espaço para suas
            <br />
            próximas grandes ideias.
          </p>
        </div>
        <button className="profile-button">
          <span className="profile-avatar">VC</span>
          <span>
            Seu espaço criativo<small>Atelier Desk</small>
          </span>
          <HelpCircle size={17} />
        </button>
      </aside>
      <main className="board-main">
        <header className="board-header">
          <div className="breadcrumb">
            <button aria-label="Voltar" onClick={() => notify('Quadro inicial')}>
              <ArrowLeft size={17} />
            </button>
            <span>Meus quadros</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Campanha de primavera</strong>
          </div>
          <div className="header-actions">
            <span className="save-state">
              <Check size={13} />
              Demo local
            </span>
            <button
              className="icon-button"
              aria-label="Pesquisar"
              onClick={() => notify('Use Ctrl/Cmd + A para selecionar os cartões')}
            >
              <Search size={17} />
            </button>
          </div>
        </header>
        <div className="board-content">
          <aside className="creation-rail" aria-label="Criar cartões">
            <button
              className="tool selected"
              title="Selecionar"
              onClick={() => useCanvas.getState().setTool('select')}
            >
              <MousePointer2 size={20} />
              <span>Selecionar</span>
            </button>
            <div className="rail-divider" />
            {(
              [
                { type: 'note', label: 'Nota', icon: FileText },
                { type: 'tasks', label: 'Tarefas', icon: ListTodo },
                { type: 'color', label: 'Cor', icon: Palette },
                { type: 'column', label: 'Coluna', icon: Square },
              ] as const
            ).map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                className="tool"
                title={'Criar ' + label}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/atelier-tool', type)}
                onClick={() => add(type)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
            <div className="rail-bottom">
              <button className="tool" title="Desfazer" onClick={() => board.undo()}>
                <Undo2 size={18} />
              </button>
              <button className="tool" title="Refazer" onClick={() => board.redo()}>
                <Redo2 size={18} />
              </button>
            </div>
          </aside>
          <div className="canvas-container">
            <div className="board-heading">
              <span className="board-kicker">PROJETO CRIATIVO</span>
              <h1>
                Campanha de primavera <span>✳</span>
              </h1>
              <p>Referências, ideias e próximos passos. Tudo no seu lugar.</p>
              <div className="board-heading-meta">
                <span className="tiny-avatar">VC</span>
                <span>Criado por você</span>
                <span className="dot-separator">·</span>
                <span>Seu espaço de trabalho</span>
              </div>
            </div>
            <Canvas board={board} renderCard={(card) => <BasicCard card={card} board={board} />} />
          </div>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          {toast.includes('Desfazer') && (
            <button
              onClick={() => {
                board.undo();
                useCanvas.setState({ toast: null });
              }}
            >
              Desfazer
            </button>
          )}
          <button
            className="toast-close"
            aria-label="Fechar aviso"
            onClick={() => useCanvas.setState({ toast: null })}
          >
            ×
          </button>
        </div>
      )}
      <div className="mobile-add">
        <button onClick={() => add('note')}>
          <Plus size={18} />
          Nova nota
        </button>
        <button onClick={() => add('tasks')}>
          <ListTodo size={18} />
          Tarefas
        </button>
        <button onClick={() => notify('Pinça para aproximar; toque longo para arrastar')}>
          <ArrowUpRight size={18} />
          Ajuda
        </button>
      </div>
    </div>
  );
}
