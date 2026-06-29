import type { Stats } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@github-repositories-fllow/ui/components/card";

interface StatsPanelProps {
  stats: Stats | null;
  loading: boolean;
}

/** 语言进度条配色（循环使用，不引图表库） */
const LANG_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
] as const;

function getLangColor(index: number): string {
  return LANG_COLORS[index % LANG_COLORS.length] ?? "#6b7280";
}

/** 统计区：数字卡片 + 语言分布进度条，操作后由父组件重新传入最新 stats */
export default function StatsPanel({ stats, loading }: StatsPanelProps) {
  const s = stats ?? {
    users: 0,
    repos: 0,
    totalFollowers: 0,
    totalPublicRepos: 0,
    topUsers: [],
    languages: [],
  };

  const numberCards = [
    { label: "账户数", value: s.users },
    { label: "仓库数", value: s.repos },
    { label: "总 Followers", value: s.totalFollowers },
    { label: "总 Public Repos", value: s.totalPublicRepos },
  ] as const;

  return (
    <div className="mb-6">
      {/* 关键数字卡片 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
        {numberCards.map((card) => (
          <Card key={card.label} size="sm">
            <CardContent>
              <div className="text-lg font-semibold tabular-nums">
                {loading ? "—" : card.value.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 语言分布（纯 CSS 进度条，宽度 = percent%，零新增依赖） */}
      {s.languages.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>语言分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {s.languages.map((lang, idx) => (
                <li key={lang.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-muted-foreground">
                    {lang.name}
                  </span>
                  {/* 进度条容器；内层 div 宽度由 percent 内联样式控制 */}
                  <div className="flex-1 h-2 overflow-hidden rounded-none bg-muted">
                    <div
                      className="h-full rounded-none transition-[width]"
                      style={{
                        width: `${lang.percent}%`,
                        backgroundColor: getLangColor(idx),
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                    {lang.count}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        !loading && (
          <p className="text-xs text-muted-foreground">暂无语言分布数据。</p>
        )
      )}
    </div>
  );
}
