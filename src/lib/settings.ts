import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Settings = Database["public"]["Tables"]["bot_settings"]["Row"] & {
  ai_enabled: boolean;
  ai_provider: "openai_compatible" | "anthropic";
  ai_base_url: string;
  ai_model: string;
  ai_api_key: string;
  command_channel_id: string;
  command_allowed_user_ids: string[];
  command_allowed_role_ids: string[];
};

export function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bot_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as Settings;
    },
  });
  const save = async (patch: Partial<Settings>) => {
    const { error } = await supabase
      .from("bot_settings")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", 1);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved — the bot picks this up within a minute");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };
  return { ...q, save };
}

export const CATEGORY_LABEL: Record<string, string> = {
  sexual: "Sexual harassment",
  severe: "Severe (family / indirect)",
  abuse: "Abuse",
  mild: "Mild",
  provoking: "Provoking",
  allow: "Allow-list (never punish)",
};
