const URL_RE = /(https?:\/\/[^\s)]+)/g;

/** Renders text with bare URLs as links; trailing punctuation stays outside the link. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) => {
        if (i % 2 === 0) return part;
        const url = part.replace(/[.,;:!?]+$/, "");
        const trailing = part.slice(url.length);
        return (
          <span key={i}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all font-medium text-primary underline underline-offset-2"
            >
              {url}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}
