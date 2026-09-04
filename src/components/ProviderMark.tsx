import codexLogo from "../../codex.svg";
import glassClaudeLogo from "../../assets/glass-claude-icon.svg";
import glassOpenAiLogo from "../../assets/glass-openai-icon.svg";
import type { ProviderId } from "../types";

export function ProviderMark({ provider, variant = "default" }: { provider: ProviderId; variant?: "default" | "glass" }) {
  const isClaude = provider === "claude" || provider === "claude_api";
  const src = variant === "glass" ? (isClaude ? glassClaudeLogo : glassOpenAiLogo) : codexLogo;
  const label = variant === "glass" ? (isClaude ? "Claude" : "OpenAI") : "Codex";

  return (
    <div className={`provider-mark provider-mark--${variant}`} aria-label={label}>
      <img src={src} alt="" />
    </div>
  );
}
