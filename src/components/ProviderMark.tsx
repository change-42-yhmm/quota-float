import codexLogo from "../../codex.svg";
import glassClaudeLogo from "../../assets/glass-claude-icon.svg";
import glassOpenAiLogo from "../../assets/glass-openai-icon.svg";
import type { ProviderId } from "../types";
import nexusGptBg from "../../assets/Nexus-gpt-bg.svg";
import nexusGptHealthy from "../../assets/Nexus-gpt-healthy.svg";
import nexusGptCaution from "../../assets/Nexus-gpt-caution.svg";
import nexusGptCritical from "../../assets/Nexus-gpt-critical.svg";
import nexusClaudeBg from "../../assets/Nexus-Claude-bg.svg";
import nexusClaudeHealthy from "../../assets/Nexus-Claude-healthy.svg";
import nexusClaudeCaution from "../../assets/Nexus-Claude-caution.svg";
import nexusClaudeCritical from "../../assets/Nexus-Claude-critical.svg";
import { clampPercent, quotaTier } from "../lib/format";

export function ProviderMark({ provider, variant = "default", nexusPercent }: { provider: ProviderId; variant?: "default" | "glass"; nexusPercent?: number | null }) {
  const isClaude = provider === "claude" || provider === "claude_api";
  if (nexusPercent !== undefined) {
    const percent = nexusPercent === null ? 0 : clampPercent(nexusPercent);
    const tier = quotaTier(percent);
    if (isClaude) {
      const fill = tier === "critical" ? nexusClaudeCritical : tier === "caution" ? nexusClaudeCaution : nexusClaudeHealthy;
      return <div className="provider-mark provider-mark--nexus provider-mark--nexus-claude" aria-label="Claude">
        <img src={nexusClaudeBg} alt="" />
        <img className="nexus-provider-fill" src={fill} alt="" style={{ clipPath: `inset(${100 - percent}% 0 0)` }} />
      </div>;
    }
    const fill = tier === "critical" ? nexusGptCritical : tier === "caution" ? nexusGptCaution : nexusGptHealthy;
    return <div className="provider-mark provider-mark--nexus" aria-label="OpenAI">
      <img src={nexusGptBg} alt="" />
      <img className="nexus-provider-fill" src={fill} alt="" style={{ clipPath: `inset(${100 - percent}% 0 0)` }} />
    </div>;
  }
  const src = variant === "glass" ? (isClaude ? glassClaudeLogo : glassOpenAiLogo) : codexLogo;
  const label = variant === "glass" ? (isClaude ? "Claude" : "OpenAI") : "Codex";

  return (
    <div className={`provider-mark provider-mark--${variant}`} aria-label={label}>
      <img src={src} alt="" />
    </div>
  );
}
