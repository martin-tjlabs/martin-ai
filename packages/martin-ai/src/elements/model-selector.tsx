import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#components/ui/dropdown-menu"
import { InputGroupButton } from "#components/ui/input-group"

import { ProviderLogo } from "./provider-logo"

import type { ChatModel } from "../models"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/model-selector
// 사고 수준(Effort) 메뉴는 EffortSelector로 따로 둔다. 둘 다 PromptInput의 actions 자리에 둔다.
// 버튼과 회사 이름 앞에 provider 로고(ProviderLogo)를 보인다.

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
}

export type ModelSelectorProps = {
  models: ChatModel[]
  value: string | undefined
  onValueChange: (id: string) => void
}

// 고를 모델이 2개 이상일 때만 보인다. 회사별로 묶어 라디오 메뉴로 보인다.
// 응답 중에도 막지 않는다. 바꾼 모델은 다음 메시지부터 쓰이고, disabled를 쓰면
// InputGroup의 has-disabled 스타일이 입력창 전체를 흐리게 만들기 때문이다.
export function ModelSelector({
  models,
  value,
  onValueChange,
}: ModelSelectorProps) {
  if (models.length < 2) {
    return null
  }

  const current = models.find((item) => item.id === value) ?? models[0]
  const providers = [...new Set(models.map((item) => item.provider))]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // InputGroupAddon의 text-muted-foreground를 물려받으면 비활성처럼 보이므로
          // 본문 글자색을 직접 지정한다. 화살표만 보조 색으로 둔다.
          <InputGroupButton
            size="sm"
            variant="outline"
            className="text-foreground [&>svg]:text-muted-foreground"
            aria-label={`모델: ${current.name}`}
          />
        }
      >
        <ProviderLogo provider={current.provider} />
        <span className="max-w-40 truncate">{current.name}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      {/* 메뉴는 body의 portal에 그려져 Chat 루트의 글꼴을 물려받지 못하므로 직접 지정한다 */}
      <DropdownMenuContent align="end" side="top" className="min-w-52 font-sans">
        <DropdownMenuRadioGroup
          value={current.id}
          onValueChange={(next) => onValueChange(String(next))}
        >
          {providers.map((provider, index) => (
            <React.Fragment key={provider}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <ProviderLogo provider={provider} className="size-3.5" />
                  {PROVIDER_LABELS[provider] ?? provider}
                </DropdownMenuLabel>
                {models
                  .filter((item) => item.provider === provider)
                  .map((item) => (
                    <DropdownMenuRadioItem
                      key={item.id}
                      value={item.id}
                      closeOnClick
                    >
                      {item.name}
                    </DropdownMenuRadioItem>
                  ))}
              </DropdownMenuGroup>
            </React.Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
