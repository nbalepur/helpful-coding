"use client";

interface ProjectDetailsTabProps {
  title: string;
  description: string | null;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export default function ProjectDetailsTab({ title, description }: ProjectDetailsTabProps) {
  const displayTitle = title || "Untitled Submission";
  const displayDescription = description ?? "No description provided.";
  const escapedTitle = escapeHtml(displayTitle);
  const escapedDescription = escapeHtml(displayDescription).replace(/\n/g, "<br/>");

  const srcDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
    body { background: #20232a; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
    .pd-root { max-width: 900px; margin: 0 auto; padding: 24px; }
    .field-label { color: #8ac4ff; font-weight: 600; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { margin-bottom: 32px; }
    .title-value { color: #e6f6ff; font-size: 2em; font-weight: 600; line-height: 1.3; }
    .description-value { color: #d6dde6; line-height: 1.6; font-size: 15px; }
    .description-value p { margin: 12px 0; }
  </style>
  <base target="_blank" />
</head>
<body>
  <div class="pd-root">
    <div class="field-label">Title</div>
    <div class="field-value title-value">${escapedTitle}</div>
    <div class="field-label">Description</div>
    <div class="field-value description-value">${escapedDescription}</div>
  </div>
  <script>
    document.addEventListener('copy', function(e) { e.preventDefault(); return false; });
    document.addEventListener('cut', function(e) { e.preventDefault(); return false; });
    document.addEventListener('paste', function(e) { e.preventDefault(); return false; });
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {
        e.preventDefault(); return false;
      }
    });
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
  </script>
</body>
</html>`;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 flex-1 overflow-hidden h-full flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        <iframe
          title="Project Details"
          srcDoc={srcDoc}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
