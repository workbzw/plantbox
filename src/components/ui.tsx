import type { LucideIcon } from "lucide-react";
import { Box, X } from "lucide-react";
import type { ReactNode } from "react";
import { Component, useEffect, useRef } from "react";
import { tr } from "../i18n";
import "../styles.css";
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.7} />
    </button>
  );
}
export function Status({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "orange" | "gray";
}) {
  return (
    <span className={`status status-${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function StatSpark({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 90 30"
      aria-hidden="true"
      className={`spark ${down ? "muted" : ""}`}
    >
      <path
        d="M1 25 12 18 22 20 32 12 42 14 51 9 62 12 74 5 88 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M1 25 12 18 22 20 32 12 42 14 51 9 62 12 74 5 88 6 V30 H1Z"
        fill="currentColor"
        opacity=".08"
      />
    </svg>
  );
}
export class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading">
        <Box size={38} />
        <strong>{tr("3D 场景暂时无法启动")}</strong>
        <p>{tr("请确认浏览器已启用硬件加速，然后重试。")}</p>
        <button className="primary-button" onClick={() => location.reload()}>
          {tr("重新加载")}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function Dialog({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const nodes = () =>
      ref.current?.querySelectorAll<HTMLElement>(
        'button,input,select,[tabindex="0"]',
      );
    (ref.current?.querySelector<HTMLElement>("input") ?? nodes()?.[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = nodes();
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton icon={X} label={tr("关闭弹窗")} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
