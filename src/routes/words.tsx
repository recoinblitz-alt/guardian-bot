import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Panel } from "@/components/Shell";
import { CATEGORY_LABEL } from "@/lib/settings";
import { compile, findMatches, type WordEntry } from "@/lib/matcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/words")({
  head: () => ({
    meta: [
      { title: "Word lists — VoiceGuard" },
      { name: "description", content: "Manage the slang words and phrases your bot punishes." },
      { property: "og:title", content: "Word lists — VoiceGuard" },
      { property: "og:description", content: "Manage the slang words and phrases your bot punishes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="Word lists">
      <Words />
    </Shell>
  ),
});

const CATS = ["sexual", "severe", "abuse", "mild", "provoking", "allow"] as const;

function Words() {
  const qc = useQueryClient();
  const { data: words = [] } = useQuery({
    queryKey: ["words"],
    queryFn: async () => (await supabase.from("slang_words").select("*").order("word")).data ?? [],
  });
  const [cat, setCat] = useState<string>("abuse");
  const [input, setInput] = useState("");
  const [test, setTest] = useState("");
  const compiled = useMemo(() => compile(words as WordEntry[]), [words]);
  const results = test.trim() ? findMatches(test, compiled) : [];

  const add = async () => {
    const list = input.split(/[\n,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 200);
    if (!list.length) return;
    const { error } = await supabase.from("slang_words").upsert(list.map((word) => ({ category: cat, word })), { onConflict: "category,word" });
    if (error) return toast.error(error.message);
    setInput("");
    toast.success(`Added ${list.length}`);
    qc.invalidateQueries({ queryKey: ["words"] });
  };
  const remove = async (id: string) => {
    await supabase.from("slang_words").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["words"] });
  };

  return (
    <>
      <Panel title="Test a sentence" desc="Type what someone might say (Hindi, Hinglish or English) and see whether the bot would catch it.">
        <Input placeholder="e.g. abe bee see teri mummy ki…" value={test} onChange={(e) => setTest(e.target.value)} />
        {test.trim() && (
          <div className="mt-3 space-y-1 text-sm">
            {results.length ? (
              results.map((m, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <span className="font-semibold text-primary">{CATEGORY_LABEL[m.category]}</span>
                  <span>heard “{m.heard}” → matches “{m.word}”</span>
                  <span className="font-mono text-xs text-muted-foreground">({m.how})</span>
                </div>
              ))
            ) : (
              <span className="text-success">Clean — no action.</span>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Add words or phrases" desc="One per line or comma-separated. Phrases like “teri mummy ki” also match with a filler word in between. Spelling variants and sound-alikes are caught automatically.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATS.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea rows={2} className="flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="bhosdike, bhosadike, teri maa ki" />
          <Button onClick={add}>Add</Button>
        </div>
      </Panel>

      {CATS.map((c) => {
        const list = words.filter((w) => w.category === c);
        return (
          <Panel key={c} title={`${CATEGORY_LABEL[c]} · ${list.length}`}>
            <div className="flex flex-wrap gap-2">
              {list.map((w) => (
                <span key={w.id} className="group inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono text-xs">
                  {w.word}
                  <button onClick={() => remove(w.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${w.word}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {!list.length && <span className="text-sm text-muted-foreground">Empty</span>}
            </div>
          </Panel>
        );
      })}
    </>
  );
}
