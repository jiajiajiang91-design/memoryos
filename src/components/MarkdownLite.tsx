// 轻量 Markdown 渲染（无依赖）：标题/列表/粗体/行内代码/引用/分隔线/代码块。
// 给「人看」的核心资料与卡片视图用；编辑仍是原文 textarea。不求全集，求干净可读。

export default function MarkdownLite({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  let listItems: { indent: number; html: string }[] = [];
  let fence: string[] | null = null;

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc pl-5 my-1.5">
        {listItems.map((it, i) => (
          <li key={i} className="my-0.5" style={{ marginLeft: it.indent * 16 }} dangerouslySetInnerHTML={{ __html: it.html }} />
        ))}
      </ul>
    );
    listItems = [];
  };

  const renderInline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-surface-soft text-[12px]">$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (fence) {
      if (/^```/.test(line.trim())) {
        blocks.push(
          <pre key={blocks.length} className="bg-paper border border-hairline rounded-md p-3 my-2 text-[12.5px] leading-[1.7] whitespace-pre-wrap font-mono text-ink-soft">
            {fence.join("\n")}
          </pre>
        );
        fence = null;
      } else {
        fence.push(raw);
      }
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushList();
      fence = [];
      continue;
    }

    const listMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    const headMatch = line.match(/^(#{1,6})\s+(.+)/);
    const quoteMatch = line.match(/^>\s?(.*)/);
    if (listMatch) {
      const indent = Math.floor(listMatch[1].length / 2);
      listItems.push({ indent, html: renderInline(listMatch[2]) });
    } else if (headMatch) {
      flushList();
      const level = headMatch[1].length;
      const size = level === 1 ? "text-[17px]" : level === 2 ? "text-[15px]" : "text-[14px]";
      blocks.push(
        <div key={blocks.length} className={`${size} font-semibold mt-4 mb-1.5`} dangerouslySetInnerHTML={{ __html: renderInline(headMatch[2]) }} />
      );
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushList();
      blocks.push(<hr key={blocks.length} className="border-hairline my-3" />);
    } else if (quoteMatch) {
      flushList();
      blocks.push(
        <div key={blocks.length} className="border-l-2 border-hairline pl-3 my-2 text-ink-faint text-[13px]" dangerouslySetInnerHTML={{ __html: renderInline(quoteMatch[1]) }} />
      );
    } else if (line.trim()) {
      flushList();
      blocks.push(<p key={blocks.length} className="my-2" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />);
    } else {
      flushList();
    }
  }
  if (fence) {
    blocks.push(
      <pre key={blocks.length} className="bg-paper border border-hairline rounded-md p-3 my-2 text-[12.5px] leading-[1.7] whitespace-pre-wrap font-mono text-ink-soft">
        {fence.join("\n")}
      </pre>
    );
  }
  flushList();
  return <>{blocks}</>;
}
