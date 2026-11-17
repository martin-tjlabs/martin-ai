import { CircleAlertIcon } from "lucide-react"
import { cn } from "cn"

export type ChatErrorProps = {
  error: Error | undefined
  className?: string
}

// 요청이 실패했을 때 입력창 위에 보이는 한 줄. 원인은 서버 로그에만 남으므로 일반 문구를 보인다.
export function ChatError({ error, className }: ChatErrorProps) {
  if (!error) {
    return null
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive",
        className
      )}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p>응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        {error.message && (
          <p className="mt-0.5 truncate text-xs text-destructive/80">
            {error.message}
          </p>
        )}
      </div>
    </div>
  )
}
