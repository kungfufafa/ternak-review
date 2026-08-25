import { cn } from '#/lib/utils'

export function BrandMark({
  className,
  title = 'Ternak Review',
}: {
  className?: string
  title?: string
}) {
  const labeled = Boolean(title)
  return (
    <svg
      aria-hidden={labeled ? undefined : true}
      className={cn('overflow-hidden', className)}
      role={labeled ? 'img' : 'presentation'}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      {labeled ? <title>{title}</title> : null}
      <rect fill="#0a0a0a" height="64" width="64" />
      <g transform="translate(5.576 46.9) scale(0.02 -0.02)">
        <path d="M32 1164V1490H1326V1164H878V0H480V1164Z" fill="#fff" />
      </g>
      <g transform="translate(31.424 46.9) scale(0.02 -0.02)">
        <path
          d="M72 0V1490H714Q880 1490 1004.5 1429.5Q1129 1369 1198.5 1255.5Q1268 1142 1268 984Q1268 824 1197 714Q1126 604 998 548Q870 492 700 492H316V806H618Q690 806 741 824Q792 842 819 881Q846 920 846 984Q846 1048 819 1088Q792 1128 741 1147Q690 1166 618 1166H476V0ZM878 0 514 684H944L1318 0Z"
          fill="#1a73e8"
        />
      </g>
    </svg>
  )
}
