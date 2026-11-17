import { BrainIcon, ChevronDownIcon } from "lucide-react"

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

import type { ChatEffort } from "../models"

// 출처: https://ui.shadcn.com/docs/ai-elements/base/model-selector (Effort 메뉴)
// 모델 선택 메뉴 옆에 둔다. "기본값"은 사고 수준을 보내지 않아 모델 기본값을 쓴다.

const EFFORT_LABELS: Record<ChatEffort, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  xhigh: "매우 높음",
  max: "최대",
}

const DEFAULT_VALUE = "default"

export type EffortSelectorProps = {
  efforts: ChatEffort[]
  value: ChatEffort | undefined
  onValueChange: (effort: ChatEffort | undefined) => void
}

// 고를 사고 수준이 없으면(대본 모드 등) 보이지 않는다.
export function EffortSelector({ efforts, value, onValueChange }: EffortSelectorProps) {
  if (efforts.length === 0) {
    return null
  }

  const label = value ? EFFORT_LABELS[value] : "기본값"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // InputGroupAddon의 회색 글자색을 물려받으면 비활성처럼 보이므로 본문 글자색을 지정한다
          <InputGroupButton
            size="sm"
            variant="outline"
            className="text-foreground [&>svg]:text-muted-foreground"
            aria-label={`사고 수준: ${label}`}
          />
        }
      >
        <BrainIcon />
        <span>{label}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      {/* 메뉴는 body의 portal에 그려져 Chat 루트의 글꼴을 물려받지 못하므로 직접 지정한다 */}
      <DropdownMenuContent align="end" side="top" className="min-w-40 font-sans">
        <DropdownMenuGroup>
          <DropdownMenuLabel>사고 수준</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value ?? DEFAULT_VALUE}
            onValueChange={(next) => {
              const effort = String(next)
              onValueChange(
                effort === DEFAULT_VALUE ? undefined : (effort as ChatEffort)
              )
            }}
          >
            <DropdownMenuRadioItem value={DEFAULT_VALUE} closeOnClick>
              기본값 (모델 기본)
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {efforts.map((effort) => (
              <DropdownMenuRadioItem key={effort} value={effort} closeOnClick>
                {EFFORT_LABELS[effort]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
