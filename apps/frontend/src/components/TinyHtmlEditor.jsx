import { useEffect, useId, useRef, useState } from "react";

const OVERFLOW_MARK_ATTR = "data-overflow-mark";

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

function unwrapOverflowMarks(root) {
  if (!root?.querySelectorAll) {
    return;
  }
  const marks = root.querySelectorAll(`span[${OVERFLOW_MARK_ATTR}="1"]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

function wrapOverflowTextNode(textNode) {
  if (!textNode?.parentNode || !textNode.nodeValue) {
    return;
  }
  const wrapper = document.createElement("span");
  wrapper.className = "tiny-html-editor__overflow-mark";
  wrapper.setAttribute(OVERFLOW_MARK_ATTR, "1");
  textNode.parentNode.insertBefore(wrapper, textNode);
  wrapper.appendChild(textNode);
}

export default function TinyHtmlEditor({
  label,
  value,
  onChange,
  placeholder = "",
  minHeight = 320,
  maxWords = 120,
  maxChars = 0,
}) {
  const inputId = useId();
  const editorRef = useRef(null);
  const validationRef = useRef(null);
  const statusId = useId();
  const [isCodeView, setIsCodeView] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
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

  function extractTextFromHtml(html) {
    const raw = String(html || "");
    if (!raw) {
      return "";
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");
    return String(doc.body?.textContent || "").replace(/\u00a0/g, " ");
  }

  function countWordsFromHtml(html) {
    const text = extractTextFromHtml(html)
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      return 0;
    }
    return text.split(" ").filter(Boolean).length;
  }

  function countCharsFromHtml(html) {
    return extractTextFromHtml(html).length;
  }

  function getCleanHtml(editor) {
    if (!editor) {
      return "";
    }
    const clone = editor.cloneNode(true);
    unwrapOverflowMarks(clone);
    return clone.innerHTML || "";
  }

  function applyOverflowHighlight(editor, charLimit) {
    if (!editor) {
      return;
    }
    unwrapOverflowMarks(editor);
    const limit = Number(charLimit || 0);
    if (!limit || limit < 1) {
      return;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    let remaining = limit;
    textNodes.forEach((textNode) => {
      if (!textNode?.nodeValue) {
        return;
      }
      if (remaining <= 0) {
        wrapOverflowTextNode(textNode);
        return;
      }
      const length = textNode.nodeValue.length;
      if (length <= remaining) {
        remaining -= length;
        return;
      }
      const overflowNode = remaining > 0 ? textNode.splitText(remaining) : textNode;
      wrapOverflowTextNode(overflowNode);
      remaining = 0;
    });
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const nextValue = value || "";
    if (getCleanHtml(editor) !== nextValue) {
      editor.innerHTML = nextValue;
    }
    applyOverflowHighlight(editor, maxChars);
  }, [value, maxChars]);

  useEffect(() => {
    if (!isCodeView) {
      return;
    }
    setSourceValue(String(value || ""));
  }, [isCodeView, value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const nextHtml = getCleanHtml(editor);
    onChange(nextHtml);
    applyOverflowHighlight(editor, maxChars);
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runCommand(command, commandValue = null) {
    if (isCodeView) {
      return;
    }
    focusEditor();
    unwrapOverflowMarks(editorRef.current);
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
    if (isCodeView) {
      return;
    }
    focusEditor();
    document.execCommand("formatBlock", false, "blockquote");
    emitChange();
  }

  function toggleCodeView() {
    if (!isCodeView) {
      const editor = editorRef.current;
      setSourceValue(getCleanHtml(editor));
      setIsCodeView(true);
      return;
    }
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = sourceValue || "";
      applyOverflowHighlight(editor, maxChars);
    }
    onChange(sourceValue || "");
    setIsCodeView(false);
  }

  function handleSelectCommand(command, value) {
    if (!value) {
      return;
    }
    runCommand(command, value);
  }

  const currentWordCount = countWordsFromHtml(value || "");
  const currentCharCount = countCharsFromHtml(value || "");
  const isWordLimitEnabled = Number(maxWords) > 0;
  const isCharLimitEnabled = Number(maxChars) > 0;
  const overflowWords = isWordLimitEnabled ? Math.max(0, currentWordCount - maxWords) : 0;
  const overflowChars = isCharLimitEnabled ? Math.max(0, currentCharCount - maxChars) : 0;
  const isWordLimitReached = isWordLimitEnabled && currentWordCount >= maxWords;
  const isCharLimitReached = isCharLimitEnabled && currentCharCount >= maxChars;
  const isOverLimit = overflowWords > 0 || overflowChars > 0;
  const overflowLabel = overflowChars > 0
    ? `${overflowChars} extra`
    : overflowWords > 0
      ? `${overflowWords} extra`
      : "";
  const limitMessage = overflowChars > 0
    ? `Maximum ${maxChars} characters allowed. Remove ${overflowChars} extra characters to continue.`
    : overflowWords > 0
      ? `Maximum ${maxWords} words allowed. Remove ${overflowWords} extra words to continue.`
      : "";

  useEffect(() => {
    if (!validationRef.current) {
      return;
    }
    validationRef.current.setCustomValidity(limitMessage);
  }, [limitMessage]);

  return (
    <div className="tiny-html-editor tiny-html-editor--simple">
      {label ? <label className="form-label" htmlFor={inputId}>{label}</label> : null}
      <div className={`tiny-html-editor__frame ${isOverLimit ? "is-overlimit" : ""}`}>
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
          <button
            type="button"
            className={`tiny-html-editor__tool ${isCodeView ? "active" : ""}`}
            onClick={toggleCodeView}
            aria-label="Code view"
            title="Code view"
          >
            <i className="bi bi-code-slash" aria-hidden="true" />
          </button>
          <button type="button" className="tiny-html-editor__tool" onClick={() => runCommand("removeFormat")} aria-label="Clear format">
            <i className="bi bi-eraser" aria-hidden="true" />
          </button>
        </div>
        {isCodeView ? (
          <textarea
            id={inputId}
            className={`tiny-html-editor__content ${isOverLimit ? "is-overlimit" : ""}`}
            style={{ minHeight, fontFamily: "'Courier New', monospace" }}
            value={sourceValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSourceValue(nextValue);
              onChange(nextValue);
            }}
            onBlur={() => onChange(sourceValue)}
            placeholder={placeholder || "Edit raw HTML"}
            aria-describedby={statusId}
          />
        ) : (
          <div
            id={inputId}
            ref={editorRef}
            className={`tiny-html-editor__content ${isOverLimit ? "is-overlimit" : ""}`}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={placeholder}
            style={{ minHeight }}
            onInput={emitChange}
            onBlur={emitChange}
            aria-describedby={statusId}
          />
        )}
        <input
          ref={validationRef}
          className="tiny-html-editor__validator"
          tabIndex={-1}
          aria-hidden="true"
          readOnly
          value={isOverLimit ? `overflow:${overflowChars || overflowWords}` : ""}
        />
      </div>
      <div id={statusId} className={`tiny-html-editor__meta ${(isCharLimitReached || isWordLimitReached) ? "is-limit" : ""} ${isOverLimit ? "is-overlimit" : ""}`}>
        {isCharLimitEnabled ? `${currentCharCount}/${maxChars} chars` : `${currentWordCount}/${maxWords} words`}
        {overflowLabel ? <span className="tiny-html-editor__extra"> ({overflowLabel})</span> : null}
      </div>
    </div>
  );
}
