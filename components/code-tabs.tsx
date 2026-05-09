"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CodeSample = {
  key: string;
  label: string;
  filename: string;
  code: string;
  html: string;
};

export function CodeTabs({ samples }: { samples: CodeSample[] }) {
  const [activeKey, setActiveKey] = useState(samples[0]?.key ?? "");
  const [copied, setCopied] = useState(false);
  const active = samples.find((s) => s.key === activeKey) ?? samples[0];

  if (!active) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex w-full flex-col overflow-clip rounded-md border border-white/[0.08] bg-[#0a0c10]">
      <div className="flex items-center justify-between border-b border-white/[0.06] py-1.5 pr-2 pl-2">
        <div className="flex items-center gap-1">
          {samples.map((s) => {
            const isActive = s.key === active.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveKey(s.key)}
                aria-pressed={isActive}
                className={`t-body rounded px-2.5 py-1.5 font-mono transition ${
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-white/45 hover:text-white/75"
                }`}
              >
                {s.label}
              </button>
            );
          })}
          <span className="t-label ml-2 font-mono text-white/40">
            {active.filename}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/55 hover:bg-white/[0.06] hover:text-white"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check className="h-4 w-4 text-[#A4F4FD]" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div
        className="w-full overflow-x-auto text-[13px] leading-[1.65] [&>pre]:px-5 [&>pre]:py-5 [&>pre]:bg-transparent"
        dangerouslySetInnerHTML={{ __html: active.html }}
      />
    </div>
  );
}
