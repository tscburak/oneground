"use client";

import { Plus, Trash2 } from "lucide-react";
import { format, useI18n } from "@/components/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { nextKey, type QuestionDraft } from "@/lib/typesafe";

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}

export function QuestionEditor({
  draft,
  onChange,
  onRemove,
}: {
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
  onRemove: () => void;
}) {
  const dict = useI18n();

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Row className="justify-between">
        <Row>
          <Badge variant="secondary">{draft.kind}</Badge>
          <Input
            value={draft.id}
            onChange={(e) => onChange({ ...draft, id: e.target.value })}
            placeholder={dict.editor.questionId}
            className="h-7 w-44 font-mono text-xs"
            aria-label={dict.editor.questionId}
          />
        </Row>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`${dict.editor.removeQuestion} ${draft.id}`}
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </Row>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{dict.editor.instructions}</Label>
        <Textarea
          value={draft.instructions}
          onChange={(e) => onChange({ ...draft, instructions: e.target.value })}
          placeholder={dict.editor.instructionsPlaceholder}
          className="min-h-16 text-sm"
        />
      </div>

      {draft.kind === "noul" && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{dict.editor.yesMeans}</Label>
            <Input
              value={draft.trueCriteria}
              onChange={(e) => onChange({ ...draft, trueCriteria: e.target.value })}
              placeholder={dict.editor.yesPlaceholder}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{dict.editor.noMeans}</Label>
            <Input
              value={draft.falseCriteria}
              onChange={(e) => onChange({ ...draft, falseCriteria: e.target.value })}
              placeholder={dict.editor.noPlaceholder}
              className="text-xs"
            />
          </div>
        </div>
      )}

      {draft.kind === "choice" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{dict.editor.options}</Label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                onChange({
                  ...draft,
                  options: [...draft.options, { key: nextKey(draft.options, "option"), description: "" }],
                })
              }
            >
              <Plus className="size-3" /> {dict.editor.addOption}
            </Button>
          </div>
          <div className="space-y-2">
            {draft.options.map((option, index) => (
              <Row key={index}>
                <Input
                  value={option.key}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[index] = { ...option, key: e.target.value };
                    onChange({ ...draft, options });
                  }}
                  placeholder={dict.editor.optionKeyPlaceholder}
                  className="h-8 w-32 font-mono text-xs"
                  aria-label={dict.editor.optionKeyPlaceholder}
                />
                <Input
                  value={option.description}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[index] = { ...option, description: e.target.value };
                    onChange({ ...draft, options });
                  }}
                  placeholder={dict.editor.optionDescriptionPlaceholder}
                  className="h-8 flex-1 text-xs"
                  aria-label={dict.editor.optionDescriptionPlaceholder}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={draft.options.length <= 2}
                  onClick={() =>
                    onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) })
                  }
                  aria-label={`${dict.editor.removeOption} ${option.key}`}
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </Row>
            ))}
          </div>
        </div>
      )}

      {draft.kind === "score" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{dict.editor.levels}</Label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draft.levels.length >= 10}
              onClick={() => onChange({ ...draft, levels: [...draft.levels, ""] })}
            >
              <Plus className="size-3" /> {dict.editor.addLevel}
            </Button>
          </div>
          <div className="space-y-2">
            {draft.levels.map((level, index) => (
              <Row key={index}>
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{index}</span>
                <Input
                  value={level}
                  onChange={(e) => {
                    const levels = [...draft.levels];
                    levels[index] = e.target.value;
                    onChange({ ...draft, levels });
                  }}
                  placeholder={format(dict.editor.levelPlaceholder, { index })}
                  className="h-8 flex-1 text-xs"
                  aria-label={format(dict.editor.levelPlaceholder, { index })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={draft.levels.length <= 2}
                  onClick={() => onChange({ ...draft, levels: draft.levels.filter((_, i) => i !== index) })}
                  aria-label={format(dict.editor.removeLevel, { index })}
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </Row>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
