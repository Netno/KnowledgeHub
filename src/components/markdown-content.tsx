"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";
import React from "react";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-400 hover:text-brand-500 underline underline-offset-2 break-all"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => {
    const items = React.Children.toArray(children).filter(React.isValidElement);
    return (
      <div className="mb-2 mt-0 space-y-0.5">
        {items.map((child, i) => (
          <div key={i} className="leading-relaxed flex">
            <span className="mr-1.5 shrink-0 select-none">•</span>
            <span className="flex-1">{(child.props as { children?: React.ReactNode }).children}</span>
          </div>
        ))}
      </div>
    );
  },
  ol: ({ children }) => {
    const items = React.Children.toArray(children).filter(React.isValidElement);
    return (
      <div className="mb-2 mt-0 space-y-0.5">
        {items.map((child, i) => (
          <div key={i} className="leading-relaxed flex">
            <span className="mr-1.5 shrink-0 select-none">{i + 1}.</span>
            <span className="flex-1">{(child.props as { children?: React.ReactNode }).children}</span>
          </div>
        ))}
      </div>
    );
  },
  li: ({ children }) => <>{children}</>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-brand-400/50 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="bg-gray-100 dark:bg-gray-900 rounded-lg p-3 my-2 overflow-x-auto text-xs">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="max-w-full h-auto rounded-lg my-2 max-h-96 object-contain"
      loading="lazy"
    />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 bg-gray-50 dark:bg-gray-800 font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
};

/** Auto-linkify plain URLs and normalize numbered lines to markdown ordered lists */
function preprocessContent(text: string): string {
  // Convert plain URLs (not already in markdown link syntax) to clickable links
  let result = text.replace(
    /(?<!\]\()(?<!\[)(https?:\/\/[^\s<>\])"]+)/g,
    "[$1]($1)",
  );

  // Convert lines starting with a number (e.g. "1 text", "2) text", "3: text")
  // to proper markdown ordered list items ("1. text")
  // But skip lines already in "1. " format
  result = result.replace(/^(\d+)[):\s]\s*/gm, (match, num) => `${num}. `);

  // Convert bullet-style lines: "• text" or "- text" without space issues
  result = result.replace(/^[•●]\s*/gm, "- ");

  return result;
}

export default function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const processed = preprocessContent(content);

  return (
    <div className={`max-w-none [&>p+div]:!-mt-[0.35rem] ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
