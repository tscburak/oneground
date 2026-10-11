"use client";

import { useState } from "react";
import { FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateDrafts, type QuestionDraft } from "@/lib/typesafe";

export type QProfile = {
  id: string;
  name: string;
  createdAt: string;
  drafts: QuestionDraft[];
};

type LibraryRow = { id: string; name: string; createdAt: string; data: unknown };

function toQProfile(row: LibraryRow): QProfile {
  const data = row.data as { drafts?: unknown };
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.createdAt),
    drafts: Array.isArray(data?.drafts)
      ? (data.drafts as QuestionDraft[]).map((draft) => ({ ...draft }))
      : [],
  };
}

export function QuestionProfileButtons({
  drafts,
  onLoad,
}: {
  drafts: QuestionDraft[];
  onLoad: (drafts: QuestionDraft[], name: string) => void;
}) {
  const dict = useI18n();
  const evalDict = dict.evalLab;
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [profiles, setProfiles] = useState<QProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/eval-lab/profiles", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load profiles.");
      setProfiles(
        (Array.isArray(data) ? data : []).map((row) =>
          toQProfile(row as LibraryRow),
        ),
      );
    } catch (error) {
      setProfiles([]);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const validationError = validateDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const response = await fetch("/api/eval-lab/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          data: { drafts: drafts.map((draft) => ({ ...draft })) },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      setName("");
      setSaveOpen(false);
      toast.success(evalDict.profileSaved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch(
        `/api/eval-lab/profiles?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete.");
      setProfiles((prev) => prev.filter((entry) => entry.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  function apply(entry: QProfile) {
    if (entry.drafts.length === 0) return;
    onLoad(
      entry.drafts.map((draft) => ({ ...draft })),
      entry.name,
    );
    setLoadOpen(false);
    toast.success(format(evalDict.profileLoaded, { name: entry.name }));
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Dialog
        open={loadOpen}
        onOpenChange={(open) => {
          setLoadOpen(open);
          if (open) void refresh();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderOpen className="size-3.5" /> {evalDict.loadProfile}
          </Button>
        </DialogTrigger>
        <DialogContent aria-label={evalDict.loadProfile}>
          <DialogHeader>
            <DialogTitle>{evalDict.savedProfiles}</DialogTitle>
          </DialogHeader>
          {loading && (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {evalDict.loading}
            </p>
          )}
          {!loading && loadError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {loadError}
            </p>
          )}
          {!loading && !loadError && profiles.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {evalDict.noProfiles}
            </p>
          )}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {profiles.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {format(evalDict.questionsCount, {
                      count: entry.drafts.length,
                    })}{" "}
                    · {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => apply(entry)}
                  >
                    {evalDict.load}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${evalDict.delete} ${entry.name}`}
                    onClick={() => void remove(entry.id)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Save className="size-3.5" /> {evalDict.saveProfile}
          </Button>
        </DialogTrigger>
        <DialogContent aria-label={evalDict.saveProfile}>
          <DialogHeader>
            <DialogTitle>{evalDict.saveProfile}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="eval-qprofile-name">{evalDict.profileName}</Label>
            <Input
              id="eval-qprofile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={evalDict.profileNamePlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {evalDict.dialogClose}
            </Button>
            <Button onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}{" "}
              {evalDict.saveProfile}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
