"use client";

import { Plus, Trash2 } from "lucide-react";
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
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Row className="justify-between">
        <Row>
          <Badge variant="secondary">{draft.kind}</Badge>
          <Input
            value={draft.id}
            onChange={(e) => onChange({ ...draft, id: e.target.value })}
            placeholder="question_id"
            className="h-7 w-44 font-mono text-xs"
            aria-label="Question id"
          />
        </Row>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove question ${draft.id}`}>
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </Row>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Instructions</Label>
        <Textarea
          value={draft.instructions}
          onChange={(e) => onChange({ ...draft, instructions: e.target.value })}
          placeholder="What should the model judge?"
          className="min-h-16 text-sm"
        />
      </div>

      {draft.kind === "noul" && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Yes means (optional)</Label>
            <Input
              value={draft.trueCriteria}
              onChange={(e) => onChange({ ...draft, trueCriteria: e.target.value })}
              placeholder="Value near 1"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">No means (optional)</Label>
            <Input
              value={draft.falseCriteria}
              onChange={(e) => onChange({ ...draft, falseCriteria: e.target.value })}
              placeholder="Value near 0"
              className="text-xs"
            />
          </div>
        </div>
      )}

      {draft.kind === "choice" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Options</Label>
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
              <Plus className="size-3" /> Option
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
                  placeholder="key"
                  className="h-8 w-32 font-mono text-xs"
                  aria-label="Option key"
                />
                <Input
                  value={option.description}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[index] = { ...option, description: e.target.value };
                    onChange({ ...draft, options });
                  }}
                  placeholder="Rubric description (optional)"
                  className="h-8 flex-1 text-xs"
                  aria-label="Option description"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={draft.options.length <= 2}
                  onClick={() =>
                    onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) })
                  }
                  aria-label={`Remove option ${option.key}`}
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
            <Label className="text-xs text-muted-foreground">Levels (ordered, 2–10)</Label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draft.levels.length >= 10}
              onClick={() => onChange({ ...draft, levels: [...draft.levels, ""] })}
            >
              <Plus className="size-3" /> Level
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
                  placeholder={`Description of level ${index}`}
                  className="h-8 flex-1 text-xs"
                  aria-label={`Level ${index} description`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={draft.levels.length <= 2}
                  onClick={() => onChange({ ...draft, levels: draft.levels.filter((_, i) => i !== index) })}
                  aria-label={`Remove level ${index}`}
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
