import { useState } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="flex items-center gap-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl px-4 py-3 focus-within:border-[hsl(var(--primary))]/50 transition-colors">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try "Organize my Downloads folder"'
          disabled={disabled}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[hsl(var(--muted-foreground))]"
          autoFocus
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="p-1.5 rounded-lg bg-[hsl(var(--primary))] text-white disabled:opacity-30 hover:opacity-90 transition-opacity"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
