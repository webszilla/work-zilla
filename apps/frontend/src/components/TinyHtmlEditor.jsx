import { useId } from "react";
import { Editor } from "@tinymce/tinymce-react";
import "tinymce/tinymce";
import "tinymce/icons/default";
import "tinymce/models/dom";
import "tinymce/themes/silver";
import "tinymce/plugins/advlist";
import "tinymce/plugins/autolink";
import "tinymce/plugins/autoresize";
import "tinymce/plugins/code";
import "tinymce/plugins/fullscreen";
import "tinymce/plugins/image";
import "tinymce/plugins/link";
import "tinymce/plugins/lists";
import "tinymce/plugins/table";
import "tinymce/skins/ui/oxide/skin.css";
import "tinymce/skins/content/default/content.css";

export default function TinyHtmlEditor({
  label,
  value,
  onChange,
  placeholder = "",
  minHeight = 320,
}) {
  const inputId = useId();

  return (
    <div className="tiny-html-editor">
      {label ? <label className="form-label" htmlFor={inputId}>{label}</label> : null}
      <div className="tiny-html-editor__frame">
        <Editor
          id={inputId}
          value={value || ""}
          onEditorChange={(nextValue) => onChange(nextValue || "")}
          init={{
            license_key: "gpl",
            menubar: false,
            branding: false,
            promotion: false,
            resize: false,
            min_height: minHeight,
            autoresize_bottom_margin: 16,
            plugins: "autolink advlist lists link image table code fullscreen autoresize",
            toolbar:
              "undo redo | blocks fontfamily fontsize | bold italic underline strikethrough forecolor backcolor | link image table | bullist numlist | alignleft aligncenter alignright alignjustify | removeformat code fullscreen",
            block_formats: "Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4",
            font_family_formats:
              "System Font=-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; Serif=Georgia,serif; Monospace=Menlo,Monaco,monospace",
            content_style: `
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.7;
                color: #0f172a;
                padding: 10px;
              }
              p { margin: 0 0 14px; }
              h2, h3, h4 { margin: 0 0 12px; color: #020617; }
              ul, ol { margin: 0 0 14px; padding-left: 22px; }
              a { color: #2563eb; }
            `,
            placeholder,
          }}
        />
      </div>
    </div>
  );
}
