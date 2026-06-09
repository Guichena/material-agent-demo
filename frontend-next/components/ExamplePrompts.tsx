"use client";

import { cn } from "@/lib/utils";

const DEFAULT_PROMPT_GROUPS = [
  {
    title: "典型应用场景",
    prompts: [
      "我想找一些稳定的钛酸锶候选材料，帮我生成几个并排一下顺序。",
      "想找 Li Fe P O 电池正极相关材料，先看看已有材料的形成能和稳定性。",
      "我想看看 Sr-Ti-O 体系里有哪些比较稳定的已知材料，列一下参考结果。",
      "我想做钛酸钡这类材料，帮我生成 4 个候选，看看哪个更稳定。",
      "我想做钛酸钡这类材料，能不能多给几个候选，先看参考材料再排一下。",
      "我想看看钛酸钡有没有比较稳定的已知材料，列出参考结果。"
    ]
  },
  {
    title: "结构生成与评估",
    prompts: [
      "生成 2 个 SrTiO3 候选结构，用 Materials Project 检索参考材料，用 MatterSim 弛豫并按能量排序，保留 top_k=2。",
      "查询 Li-Fe-P-O 电池材料体系在 Materials Project 中的参考材料，给出带隙、形成能、稳定性，不生成新结构。",
      "查询 Sr-Ti-O 体系在 Materials Project 中的参考材料，给出带隙、形成能、稳定性，不生成新结构。",
      "生成 10 个 BaTiO3 候选结构，用 Materials Project 检索参考材料，用 MatterSim 进行晶胞弛豫，按能量排序，保留 top_k=10。",
      "查询 BaTiO3 在 Materials Project 中的参考材料，给出带隙、形成能和稳定性，不生成新结构。"
    ]
  },
  {
    title: "数据库检索与材料筛选",
    prompts: [
      "我想看看 K-Na-Nb-O 体系里有哪些已知参考材料，列出带隙、形成能和稳定性，不需要生成新结构。",
      "我想探索 K-Na-Nb-O 体系里可能稳定的无铅压电候选材料，先检索已知参考材料，再生成 3 个候选结构并按能量排序。",
      "生成 3 个 TiO2 候选结构，用 Materials Project 检索参考材料，用 MatterSim 进行晶胞弛豫并返回最大力、RMS 力和应力范数，按能量排序，保留 top_k=3。"
    ]
  }
];

interface ExamplePromptsProps {
  prompts?: string[];
  onSelect: (prompt: string) => void;
}

function PromptButton({ prompt, onSelect }: { prompt: string; onSelect: (prompt: string) => void }) {
  return (
    <button
      type="button"
      key={prompt}
      onClick={() => onSelect(prompt)}
      className={cn(
        "rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition",
        "hover:border-primary/30 hover:bg-sky-50 hover:text-slate-950"
      )}
    >
      {prompt}
    </button>
  );
}

export function ExamplePrompts({ prompts, onSelect }: ExamplePromptsProps) {
  if (prompts?.length) {
    return (
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <PromptButton key={prompt} prompt={prompt} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {DEFAULT_PROMPT_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <div className="text-xs font-medium text-slate-500">{group.title}</div>
          <div className="flex flex-wrap gap-2">
            {group.prompts.map((prompt) => (
              <PromptButton key={prompt} prompt={prompt} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
