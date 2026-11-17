import { BotIcon } from "lucide-react"
import { cn } from "cn"

// provider 로고. SVG 경로는 Simple Icons(https://simpleicons.org, 프로젝트 라이선스 CC0)에서 가져왔다.
// 로고는 각 회사의 상표이며, 여기서는 모델을 만든 회사를 구분하는 용도로만 쓴다.
// 실서비스에 쓰기 전에는 각 회사의 브랜드 가이드라인을 확인해야 한다.
// 로고가 없는 provider(예: openai, Simple Icons에서 빠짐)는 일반 아이콘으로 보인다.

type Logo = { title: string; hex: string; path: string }

const LOGOS: Record<string, Logo> = {
  anthropic: {
    title: "Anthropic",
    hex: "191919",
    path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
  },
  google: {
    title: "Google",
    hex: "4285F4",
    path: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  },
}

export type ProviderLogoProps = {
  /** CHAT_MODELS의 회사 접두사. 예: "anthropic", "google" */
  provider: string
  className?: string
}

// 옆에 회사 이름이나 모델 이름을 함께 보이므로 로고 자체는 보조 기술에서 숨긴다.
export function ProviderLogo({ provider, className }: ProviderLogoProps) {
  const logo = LOGOS[provider]

  if (!logo) {
    return (
      <BotIcon
        aria-hidden="true"
        data-slot="provider-logo"
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-slot="provider-logo"
      className={cn("size-4 shrink-0", className)}
      fill={`#${logo.hex}`}
    >
      <path d={logo.path} />
    </svg>
  )
}
