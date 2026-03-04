import { useEffect, useId, useRef } from "react";

function wrapSelectionWithTag(tagName, editor) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !editor?.contains(selection.anchorNode)) {
    return;
  }
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  if (!selectedText) {
    return;
  }
  const wrapper = document.createElement(tagName);
  wrapper.textContent = selectedText;
  range.deleteContents();
  range.insertNode(wrapper);
  selection.removeAllRanges();
}

export default function TinyHtmlEditor({
  label,
  value,
  onChange,
  placeholder = "",
  minHeight = 320,
}) {
  const inputId = useId();
  const editorRef = useRef(null);
  const fontOptions = [
    { label: "Font", value: "" },
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Georgia", value: "Georgia, serif" },
    { label: "Tahoma", value: "Tahoma, sans-serif" },
    { label: "Verdana", value: "Verdana, sans-serif" },
    { label: "Courier", value: "'Courier New', monospace" },
  ];
  const blockOptions = [
    { label: "Formatting", value: "" },
    { label: "Paragraph", value: "p" },
    { label: "Heading 2", value: "h2" },
    { label: "Heading 3", value: "h3" },
    { label: "Heading 4", value: "h4" },
  ];
  const fontSizeOptions = [
    { label: "Font size", value: "" },
    { label: "12", value: "2" },
    { label: "14", value: "3" },
    { label: "18", value: "4" },
    { label: "24", value: "5" },
    { label: "32", value: "6" },
  ];

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const nextValue = value || "";
    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue;
    }
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    onChange(editor.innerHTML || "");
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runCommand(command, commandValue = null) {
    focusEditor();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  function handleLink() {
    const url = window.prompt("Enter link URL");
    if (!url) {
      return;
    }
    runCommand("createLink", url);
  }

  function handleBlockquote() {
    focusEditor();
    document.execCommand("formatBlock", false, "blockquote");
    emitChange();
  }

  function handleCode() {
    focusEditor();
    wrapSelectionWithTag("code", editorRef.current);
    emitChange();
  }

  function handleSelectCommand(command, value) {
    if (!value) {
      return;
    }
    runCommand(command, value);
  }

  return (
    <div className="tiny-html-editor tiny-html-editor--simple">
      {label ? <label className="form-label" htmlFor={inputId}>{label}</label> : null}
      <div className="tiny-html-editor__frame">
        <div className="tiny-html-editor__toolbar" role="toolbar" aria-label={`${label || "HTML"} toolbar`}>
          <select className="tiny-html-editor__select" defaultValue="" onChange={(event) => {
            handleSelectCommand("fontName", event.target.value);
            event.target.value = "";
          }}>
            {fontOptions.map((option) => (
              <option key={`font-${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="tiny-html-editor__select" defaultValue="" onChange={(event) => {
            handleSelectCommand("formatBlock", event.target.value);
            event.target.value = "";
          }}>
            {blockOptions.map((option) => (
              <option key={`block-${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="tiny-html-editor__select" defaultValue="" onChange={(event) => {
            handleSelectCommand("fontSize", event.target.value);
            event.target.value = "";
          }}>
            {fontSizeOptions.map((option) => (
              <option key={`size-${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("bold")} aria-label="Bold">
            <i className="bi bi-type-bold" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("italic")} aria-label="Italic">
            <i className="bi bi-type-italic" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("underline")} aria-label="Underline">
            <i className="bi bi-type-underline" aria-hidden="true" />
          </button>
          <label className="tiny-html-editor__color" aria-label="Text color">
            <input type="color" defaultValue="#111111" onChange={(event) => runCommand("foreColor", event.target.value)} />
            <i className="bi bi-palette" aria-hidden="true" />
          </label>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("justifyLeft")} aria-label="Align left">
            <i className="bi bi-text-left" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("justifyCenter")} aria-label="Align center">
            <i className="bi bi-text-center" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("justifyRight")} aria-label="Align right">
            <i className="bi bi-text-right" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("justifyFull")} aria-label="Justify">
            <i className="bi bi-justify" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={handleBlockquote} aria-label="Quote">
            <i className="bi bi-blockquote-left" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("insertUnorderedList")} aria-label="Bullet list">
            <i className="bi bi-list-ul" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("insertOrderedList")} aria-label="Numbered list">
            <i className="bi bi-list-ol" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("undo")} aria-label="Undo">
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("redo")} aria-label="Redo">
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={handleLink} aria-label="Link">
            <i className="bi bi-link-45deg" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("unlink")} aria-label="Unlink">
            <i className="bi bi-link" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={handleCode} aria-label="Code">
            <i className="bi bi-code-slash" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("removeFormat")} aria-label="Clear format">
            <i className="bi bi-eraser" aria-hidden="true" />
          </button>
        </div>
        <div
          id={inputId}
          ref={editorRef}
          className="tiny-html-editor__content"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          style={{ minHeight }}
          onInput={emitChange}
          onBlur={emitChange}
        />
      </div>
    </div>
  );
}
