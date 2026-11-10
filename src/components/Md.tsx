import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Md({ children, allowExternalLinks = true }: { children: string; allowExternalLinks?: boolean }) {
  return (
    <div className="prose-rb">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        // Retrieved text and model output must not trigger external image loads.
        img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : '[Image omitted]'}</span>,
        a: ({ href, children: label }) => allowExternalLinks || /^\/knowledge\/[a-zA-Z0-9%_-]+$/.test(href || '')
          ? <a href={href} rel="noreferrer">{label}</a> : <span>{label}</span>,
      }}>{children}</ReactMarkdown>
    </div>
  );
}
