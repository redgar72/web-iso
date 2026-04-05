import type { DialogLineView } from '../npc/dialogSession';

export interface DialogPanel {
  readonly root: HTMLDivElement;
  isOpen(): boolean;
  open(title: string, line: DialogLineView, handlers: DialogHandlers): void;
  /** Refresh body text and option buttons while keeping the panel open. */
  showLine(title: string, line: DialogLineView, handlers: DialogHandlers): void;
  close(): void;
}

export interface DialogHandlers {
  onOption: (index: number) => void;
  onClose: () => void;
}

export function createDialogPanel(container: HTMLElement): DialogPanel {
  const root = document.createElement('div');
  root.style.cssText =
    'display:none;position:absolute;left:50%;bottom:18%;transform:translateX(-50%);z-index:80;' +
    'width:min(420px,calc(100vw - 32px));background:rgba(18,16,26,0.96);' +
    'border:1px solid rgba(200,175,130,0.45);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,0.55);' +
    'padding:14px 16px 12px;font:14px system-ui,sans-serif;color:#ece8e0;';
  container.appendChild(root);

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:600;margin-bottom:10px;color:#d4c4a8;';
  const bodyEl = document.createElement('div');
  bodyEl.style.cssText = 'line-height:1.45;margin-bottom:12px;white-space:pre-wrap;color:#e4dfd6;';
  const optionsWrap = document.createElement('div');
  optionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

  const closeRow = document.createElement('div');
  closeRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:10px;';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);' +
    'background:#2a2a34;color:#ddd;cursor:pointer;font:12px sans-serif;';
  closeRow.appendChild(closeBtn);

  root.append(titleEl, bodyEl, optionsWrap, closeRow);

  let open = false;
  let handlersRef: DialogHandlers | null = null;

  const btnStyle =
    'text-align:left;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);' +
    'background:rgba(255,255,255,0.06);color:#f0ebe3;cursor:pointer;font:13px sans-serif;';

  function wireClose(): void {
    closeBtn.onclick = () => {
      handlersRef?.onClose();
    };
  }

  function renderLine(title: string, line: DialogLineView): void {
    titleEl.textContent = title;
    bodyEl.textContent = line.text;
    optionsWrap.replaceChildren();
    for (const opt of line.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.style.cssText = btnStyle;
      const idx = opt.index;
      b.addEventListener('click', () => handlersRef?.onOption(idx));
      optionsWrap.appendChild(b);
    }
  }

  wireClose();

  return {
    root,
    isOpen: () => open,
    open(title, line, handlers) {
      handlersRef = handlers;
      open = true;
      root.style.display = 'block';
      renderLine(title, line);
    },
    showLine(title, line, handlers) {
      handlersRef = handlers;
      renderLine(title, line);
    },
    close() {
      open = false;
      handlersRef = null;
      root.style.display = 'none';
      optionsWrap.replaceChildren();
    },
  };
}
