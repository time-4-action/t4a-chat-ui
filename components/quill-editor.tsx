"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";

interface ImgOverlay {
  el: HTMLImageElement;
  top: number;
  left: number;
  width: number;
  height: number;
}

type Corner = "nw" | "ne" | "se" | "sw";

const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: "nw-resize" },
  ne: { top: -5, right: -5, cursor: "ne-resize" },
  se: { bottom: -5, right: -5, cursor: "se-resize" },
  sw: { bottom: -5, left: -5, cursor: "sw-resize" },
};

const ReactQuill = dynamic(
  async () => {
    const { default: RQ, Quill } = await import("react-quill-new");
    const BaseImage = Quill.import("formats/image") as any;

    class StyledImage extends BaseImage {
      static formats(domNode: HTMLElement) {
        // Only style on top of base formats (alt/height/width)
        const f = super.formats(domNode) as Record<string, string>;
        const style = domNode.getAttribute("style");
        if (style) f.style = style;
        return f;
      }
      format(name: string, value: string) {
        if (name === "style") {
          if (value) this.domNode.setAttribute("style", value);
          else this.domNode.removeAttribute("style");
        } else {
          super.format(name, value);
        }
      }
    }

    Quill.register(StyledImage, true);
    return RQ;
  },
  { ssr: false }
);

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function QuillEditor({ value, onChange }: Props) {
  const quillRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<ImgOverlay | null>(null);

  // Internal state avoids the controlled-component re-render feedback loop
  // (where onChange → parent state update → value prop → Quill re-processes HTML → styles lost)
  const [internalHtml, setInternalHtml] = useState(value);
  const lastEmitted = useRef(value);

  // Sync external value changes (e.g. initial load from server)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setInternalHtml(value);
      lastEmitted.current = value;
    }
  }, [value]);

  function handleChange(html: string) {
    lastEmitted.current = html;
    setInternalHtml(html);
    onChange(html);
  }

  const getEditor = () => quillRef.current?.getEditor?.();

  // getBoundingClientRect already gives viewport coords — just subtract parent
  const calcOverlay = useCallback((el: HTMLImageElement): ImgOverlay | null => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return null;
    const wr = wrapper.getBoundingClientRect();
    const ir = el.getBoundingClientRect();
    return {
      el,
      top: ir.top - wr.top,
      left: ir.left - wr.left,
      width: ir.width,
      height: ir.height,
    };
  }, []);

  // Detect image clicks
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest?.(".img-toolbar")) return;
      if (t.tagName === "IMG") {
        const o = calcOverlay(t as HTMLImageElement);
        if (o) setOverlay(o);
      } else {
        setOverlay(null);
      }
    }
    wrapper.addEventListener("mousedown", onClick);
    return () => wrapper.removeEventListener("mousedown", onClick);
  }, [calcOverlay]);

  // Corner resize drag
  const startResize = useCallback(
    (e: React.MouseEvent, corner: Corner) => {
      e.preventDefault();
      e.stopPropagation();
      if (!overlay) return;

      const startX = e.clientX;
      const startWidth = overlay.width;
      const aspect =
        overlay.el.naturalWidth && overlay.el.naturalHeight
          ? overlay.el.naturalWidth / overlay.el.naturalHeight
          : startWidth / overlay.height;
      const isLeft = corner === "nw" || corner === "sw";

      function onMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const newWidth = Math.max(20, startWidth + (isLeft ? -dx : dx));
        overlay.el.style.width = `${Math.round(newWidth)}px`;
        overlay.el.style.height = `${Math.round(newWidth / aspect)}px`;
        // Update overlay box live (no onChange → no React/Quill re-render during drag)
        const o = calcOverlay(overlay.el);
        if (o) setOverlay(o);
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const quill = getEditor();
        if (quill) {
          const html = quill.root.innerHTML;
          lastEmitted.current = html;
          setInternalHtml(html);
          onChange(html);
        }
        // Clear overlay — el ref is stale after React re-render from onChange above
        setOverlay(null);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [overlay, calcOverlay, onChange]
  );

  const applyAlign = useCallback(
    (align: "left" | "center" | "right") => {
      if (!overlay) return;
      const el = overlay.el;
      if (align === "center") {
        el.style.display = "block";
        el.style.float = "none";
        el.style.margin = "4px auto";
      } else if (align === "left") {
        el.style.display = "inline";
        el.style.float = "left";
        el.style.margin = "0 10px 4px 0";
      } else {
        el.style.display = "inline";
        el.style.float = "right";
        el.style.margin = "0 0 4px 10px";
      }
      const quill = getEditor();
      if (quill) {
        const html = quill.root.innerHTML;
        lastEmitted.current = html;
        setInternalHtml(html);
        onChange(html);
      }
      setOverlay(null);
    },
    [overlay, onChange]
  );

  const deleteImage = useCallback(() => {
    if (!overlay) return;
    overlay.el.remove();
    setOverlay(null);
    const quill = getEditor();
    if (quill) {
      const html = quill.root.innerHTML;
      lastEmitted.current = html;
      setInternalHtml(html);
      onChange(html);
    }
  }, [overlay, onChange]);

  const modules = useMemo(
    () => ({
      toolbar: [
        ["bold", "italic", "underline"],
        ["link", "image"],
        [{ color: [] }],
        ["clean"],
      ],
    }),
    []
  );

  return (
    <div ref={wrapperRef} className="quill-wrapper relative" style={{ overflow: "visible" }}>
      <style>{`
        .quill-wrapper .ql-toolbar {
          border-radius: 0.75rem 0.75rem 0 0;
          border-color: #e2e8f0;
          background: #f8fafc;
          font-family: inherit;
        }
        .quill-wrapper .ql-container {
          border-radius: 0 0 0.75rem 0.75rem;
          border-color: #e2e8f0;
          background: #f8fafc;
          font-family: inherit;
          font-size: 0.875rem;
          min-height: 120px;
        }
        .quill-wrapper .ql-editor {
          min-height: 120px;
          color: #1e293b;
        }
        .quill-wrapper .ql-editor.ql-blank::before {
          color: #94a3b8;
          font-style: normal;
        }
        .quill-wrapper .ql-editor img {
          cursor: pointer;
        }
      `}</style>

      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={internalHtml}
        onChange={handleChange}
        modules={modules}
        placeholder="Best regards, Grega"
      />

      {overlay && (
        <div
          className="img-toolbar absolute pointer-events-none"
          style={{
            top: overlay.top,
            left: overlay.left,
            width: overlay.width,
            height: overlay.height,
            zIndex: 10,
          }}
        >
          {/* Selection border */}
          <div className="absolute inset-0 border-2 border-blue-500 rounded-sm pointer-events-none" />

          {/* Corner resize handles */}
          {(["nw", "ne", "se", "sw"] as Corner[]).map((c) => (
            <div
              key={c}
              className="absolute w-3 h-3 bg-blue-500 border-2 border-white rounded-sm pointer-events-auto z-20"
              style={CORNER_STYLE[c]}
              onMouseDown={(e) => startResize(e, c)}
            />
          ))}

          {/* Floating toolbar */}
          <div
            className="img-toolbar absolute pointer-events-auto flex items-center gap-0.5 bg-slate-800 rounded-lg px-1.5 py-1 shadow-xl"
            style={{ top: -40, left: 0 }}
          >
            <button
              onMouseDown={(e) => { e.preventDefault(); applyAlign("left"); }}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
              title="Float left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyAlign("center"); }}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
              title="Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyAlign("right"); }}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
              title="Float right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-slate-600 mx-0.5" />
            <button
              onMouseDown={(e) => { e.preventDefault(); deleteImage(); }}
              className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-slate-600 transition-colors"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
