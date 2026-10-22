interface Props {
  text: string
  as?: 'h1' | 'span'
  className?: string
}

/** A big heading set like a flip clock: each word on its own split card. */
export function FlipText({ text, as: Tag = 'span', className }: Props) {
  const words = text.split(' ')
  return (
    <Tag className={`flip${className ? ` ${className}` : ''}`}>
      {words.map((word, i) => (
        <span key={i} className="flip__card">
          {word}
          {/* Real spaces between cards, so the heading reads as words to screen readers and copy-paste. */}
          {i < words.length - 1 && <span className="flip__space"> </span>}
        </span>
      ))}
    </Tag>
  )
}
